import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { type AskContext, dateText, euros, weekdayIn, whenText, yearIn } from "./context";
import {
  HREF, WEEKDAYS_EN, adminReportStats, contactCard, financeContractsDue, financeSpend, knowledgeDocs, loadBins,
  loadKeyContacts, loadKnowledge, loadMeetings, loadMyBlocks, loadMyReports, loadNeighbours, neighbourCard, sourceFor,
  weekdayList, type Knowledge, type KnowledgeItem,
} from "./data";
import { createDraft, sanitizeDraft } from "./reports";
import { normalize, rank, snippet, tokenSet, words } from "./text";
import type { ContactCard, PendingReport, Source } from "./types";

/* ---------------------------------------------------------------------------
   Tools Claude can call. Every tool runs as the signed-in user (ctx.db is the
   user's RLS-bound client), so a tenant can never read admin data through the
   assistant. Results carry short references ([S1], [C1]) that the answer cites;
   the server maps them back to links and contact buttons.
   --------------------------------------------------------------------------- */

type BetaTool = Anthropic.Beta.BetaTool;

const RESIDENT_TOOLS: BetaTool[] = [
  {
    name: "draft_report",
    description:
      "Prepare a report of a problem (something broken, a leak, noise, cleaning, parking) for the user to confirm. " +
      "This does NOT send anything: the user sees the draft with 'Confirm and send' and 'Cancel' buttons. Use it only when the user asks you to report or log a specific problem.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title in the user's language, e.g. 'Water leaking on the Block B stairs'. Max 120 characters." },
        description: { type: "string", description: "What happened, in the user's words. Max 2000 characters." },
        location: { type: "string", description: "Where exactly, e.g. 'Block B stairs, 2nd floor'. Empty string if unknown." },
        kind: { type: "string", enum: ["incident", "complaint"], description: "incident = something broken or dangerous; complaint = noise, pets, parking, cleaning, behaviour." },
        urgent: { type: "boolean", description: "True for danger, water leaks or someone stuck." },
      },
      required: ["title", "description", "location", "kind", "urgent"],
    },
  },
  {
    name: "find_contact",
    description:
      "Find who to contact: committee (president, secretary, treasurer), the office, the concierge, the user's block representative, " +
      "service companies, emergency numbers, or a neighbour by name or flat (e.g. 'B-3C'). Returns only details this user is allowed to see.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "A role, service, problem, person's name or flat label, e.g. 'block representative', 'leak', 'pool', 'Hans Becker'." } },
      required: ["query"],
    },
  },
  {
    name: "get_bin_schedule",
    description: "Bin collection days, colours, put-out times and where the bins are. Also says which bins go out today or tomorrow.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_my_reports",
    description: "The user's own reported problems and their status.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_next_meetings",
    description: "Upcoming community meetings (date, time, place or online, agenda) and the most recent past meeting with its summary and decisions.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "note_unanswered",
    description: "Call this when the community's information does not answer the user's question, so the office can add an answer. Then tell the user you've passed it on.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_info",
    description:
      "Search the community's own information: house rules and info pages (pool, parking, office, emergencies, moving), the FAQ answered by the office, " +
      "bin schedules, documents the user may read (statutes, minutes, insurance), local places (pharmacy, doctor, restaurants, walks, buses) and meetings.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords in English or Spanish, e.g. 'pool guests', 'pharmacy', 'garage remote'." } },
      required: ["query"],
    },
  },
];

const ADMIN_TOOLS: BetaTool[] = [
  {
    name: "admin_report_stats",
    description: "Administrators only: open reports across the community by status and category, the number of urgent ones, and the oldest.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

const FINANCE_TOOLS: BetaTool[] = [
  {
    name: "finance_contracts_due",
    description: "Finance roles only: supplier contracts whose notice deadline or end date falls within the given number of days.",
    input_schema: {
      type: "object",
      properties: { within_days: { type: "integer", minimum: 1, maximum: 730, description: "Look-ahead window in days, e.g. 90." } },
      required: ["within_days"],
    },
  },
  {
    name: "finance_spend_summary",
    description: "Finance roles only: budget versus actual spending per category for a year, and the largest suppliers this year.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer", minimum: 2000, maximum: 2100 } },
      required: ["year"],
    },
  },
];

/** The tool list for this user, in a fixed order so the prompt prefix stays cacheable. */
export function toolsFor(ctx: AskContext): BetaTool[] {
  return [
    ...RESIDENT_TOOLS,
    ...(ctx.s.isAdmin ? ADMIN_TOOLS : []),
    ...(ctx.s.isFinance ? FINANCE_TOOLS : []),
  ];
}

/** What the tools found during one answer: referenced sources, contacts, a drafted report. */
export class ToolState {
  sources = new Map<string, Source>();
  contacts = new Map<string, ContactCard>();
  pending: PendingReport | null = null;
  unanswered = false;
  private s = 0;
  private c = 0;
  private knowledge: Knowledge | null = null;

  source(src: Source): string {
    for (const [ref, v] of this.sources) if (v.kind === src.kind && v.href === src.href && v.label === src.label) return ref;
    const ref = `S${++this.s}`;
    this.sources.set(ref, src);
    return ref;
  }

  contact(card: ContactCard): string {
    for (const [ref, v] of this.contacts) if (v.name === card.name && v.phone === card.phone) return ref;
    const ref = `C${++this.c}`;
    this.contacts.set(ref, card);
    return ref;
  }

  async loadKnowledge(ctx: AskContext) {
    return (this.knowledge ??= await loadKnowledge(ctx.db, ctx.s.community.id));
  }
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Run one tool call. Returns the JSON text for the tool_result and whether it was an error. */
export async function runTool(ctx: AskContext, state: ToolState, name: string, input: unknown): Promise<{ content: string; isError?: boolean }> {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const c = ctx.s.community.id;
  const json = (v: unknown) => ({ content: JSON.stringify(v) });

  switch (name) {
    case "search_info": {
      const query = str(args.query, 300);
      if (!query) return { content: "query is required", isError: true };
      const k = await state.loadKnowledge(ctx);
      const hits = rank(query, knowledgeDocs(k), { limit: 5, minCoverage: 0.3 });
      return json({
        results: hits.map((h) => ({ ref: state.source(sourceFor(h.doc.data)), ...describe(h.doc.data, ctx) })),
        note: hits.length ? undefined : "Nothing in the community's information matches. Consider note_unanswered.",
      });
    }

    case "get_bin_schedule": {
      const bins = await loadBins(ctx.db, c);
      const today = weekdayIn(ctx.tz, ctx.now);
      const tomorrow = (today + 1) % 7;
      const ref = state.source({ kind: "bins", label: "Bin days", href: HREF.bins() });
      return json({
        ref,
        today: WEEKDAYS_EN[today],
        bins: bins.map((b) => ({
          bin: b.bin_type, colour: b.color, collected: weekdayList(b.weekdays), put_out: b.put_out_time, where: b.location, notes: b.notes,
          collected_today: b.weekdays.includes(today), collected_tomorrow: b.weekdays.includes(tomorrow),
        })),
      });
    }

    case "get_next_meetings": {
      const { upcoming, past } = await loadMeetings(ctx.db, c);
      const m = (x: (typeof upcoming)[number]) => ({
        ref: state.source({ kind: "meeting", label: x.title, href: HREF.meeting(x.id) }),
        title: x.title, type: x.meeting_type, status: x.status, when: whenText(x.starts_at, ctx.tz, "en"),
        where: x.location ?? (x.meeting_url ? "Online (link on the meeting page)" : null),
        agenda: x.agenda,
      });
      const last = past[0];
      return json({
        upcoming: upcoming.slice(0, 3).map(m),
        last_meeting: last ? { ...m(last), summary: last.minutes?.[0]?.summary ?? null, decisions: last.minutes?.[0]?.decisions ?? [] } : null,
      });
    }

    case "find_contact": {
      const query = str(args.query, 200);
      if (!query) return { content: "query is required", isError: true };
      const [all, myBlocks] = await Promise.all([loadKeyContacts(ctx.db, c), loadMyBlocks(ctx.db, c)]);
      const blockName = new Map(myBlocks.map((b) => [b.id, b.name]));
      const q = tokenSet(query);
      let rows = q.has("representative") ? all.filter((k) => k.building_id) : [];
      if (!rows.length) {
        const docs = all.map((k) => ({ key: k.id, title: `${k.role_title} ${k.name ?? ""} ${k.organisation ?? ""}`, tags: k.contact_group, body: k.notes ?? "", data: k }));
        rows = rank(query, docs, { limit: 4, minCoverage: 0.34, ignore: ["contact", "hours"] }).map((h) => h.doc.data);
      }
      const asked = words(query).filter((w) => w.length >= 3);
      const flat = /\b([A-Za-z])-?(\d{1,2})([A-Za-z])\b/.exec(query);
      const label = flat ? `${flat[1].toUpperCase()}-${flat[2]}${flat[3].toUpperCase()}` : null;
      const people = (await loadNeighbours(ctx.db, c)).filter((p) => !p.is_me && (
        (label && p.unit_label === label) || normalize(p.full_name).split(" ").some((part) => part.length >= 3 && asked.includes(part))));
      const results = [
        ...rows.map((k) => {
          const card = contactCard(k, k.building_id ? blockName.get(k.building_id) : null);
          return { ref: state.contact(card), role: card.role, name: card.name, organisation: k.organisation, phone: card.phone, whatsapp: card.whatsapp, email: card.email, hours: card.hours, notes: k.notes };
        }),
        ...people.slice(0, 4).map((p) => {
          const card = neighbourCard(p);
          return { ref: state.contact(card), role: card.role, name: card.name, phone: card.phone, email: card.email, details_shared: p.shared };
        }),
      ];
      if (rows.length || people.length) state.source({ kind: rows.length ? "contacts" : "members", label: rows.length ? "Key contacts" : "Members", href: rows.length ? HREF.contacts() : HREF.members() });
      return json(results.length ? { results } : {
        results: [],
        note: "No match. Residents only see neighbours in their own block. Suggest the office or concierge (search find_contact for 'office' or 'concierge').",
      });
    }

    case "get_my_reports": {
      const rows = await loadMyReports(ctx.db, c, ctx.s.userId);
      return json({
        reports: rows.map((r) => ({
          ref: state.source({ kind: "report", label: r.title, href: HREF.report(r.id) }),
          title: r.title, status: r.status.replace(/_/g, " "), priority: r.priority, reported: dateText(r.created_at, ctx.tz, "en"),
        })),
        new_report_page: state.source({ kind: "report", label: "Report a problem", href: HREF.newReport() }),
      });
    }

    case "draft_report": {
      const draft = sanitizeDraft({
        title: str(args.title, 120),
        description: str(args.description, 2000),
        location: str(args.location, 120) || null,
        kind: args.kind === "complaint" ? "complaint" : "incident",
        urgent: args.urgent === true,
      });
      if (!draft) return { content: "title and description are required (at least 3 characters each)", isError: true };
      if (state.pending) return { content: "A draft already exists in this answer. Ask the user to confirm it first.", isError: true };
      const pending = await createDraft(ctx, draft);
      if (!pending) return { content: "The draft could not be saved.", isError: true };
      state.pending = pending;
      return json({ status: "draft_ready_not_sent", title: pending.title, note: "Tell the user to check the draft below your answer and press Confirm and send. Do not say it has been sent." });
    }

    case "note_unanswered":
      state.unanswered = true;
      return json({ status: "noted", note: "The question will appear on the office's list of questions to answer." });

    case "admin_report_stats": {
      if (!ctx.s.isAdmin) return { content: "Not available for this user.", isError: true };
      const st = await adminReportStats(ctx.db, c);
      const ref = state.source({ kind: "reports", label: "Reports", href: HREF.reports() });
      return json({ ref, ...st, oldest: st.oldest.map((o) => ({ title: o.title, reported: dateText(o.created_at, ctx.tz, "en") })) });
    }

    case "finance_contracts_due": {
      if (!ctx.s.isFinance) return { content: "Not available for this user.", isError: true };
      const days = Math.min(730, Math.max(1, Math.round(Number(args.within_days) || 90)));
      const rows = await financeContractsDue(ctx.db, c, days);
      const ref = state.source({ kind: "finance", label: "Contracts", href: "/finance/contracts" });
      return json({
        ref,
        contracts: rows.map((r) => ({
          title: r.title, supplier: r.supplier_name, ends: r.end_date, notice_deadline: r.notice_deadline,
          days_to_notice: r.days_to_notice, auto_renew: r.auto_renew, annual_cost: euros(Number(r.annual_cost_cents), "en", ctx.s.community.currency),
        })),
      });
    }

    case "finance_spend_summary": {
      if (!ctx.s.isFinance) return { content: "Not available for this user.", isError: true };
      const thisYear = yearIn(ctx.tz, ctx.now);
      const year = Number.isInteger(args.year) ? Math.min(thisYear + 1, Math.max(2000, args.year as number)) : thisYear;
      const { lines, topSuppliers } = await financeSpend(ctx.db, c, year);
      const ref = state.source({ kind: "finance", label: "Finance", href: HREF.finance() });
      return json({
        ref, year,
        categories: lines.map((l) => ({ category: l.category, budget: euros(l.budget_cents, "en", ctx.s.community.currency), spent: euros(l.actual_cents, "en", ctx.s.community.currency) })),
        largest_suppliers_this_year: topSuppliers.map((s) => ({ supplier: s.name, spent: euros(s.cents, "en", ctx.s.community.currency) })),
      });
    }

    default:
      return { content: `Unknown tool ${name}`, isError: true };
  }
}

function describe(it: KnowledgeItem, ctx: AskContext): Record<string, unknown> {
  switch (it.type) {
    case "info": return { type: "info page", title: it.row.title, text: snippet(it.row.body, 1500) };
    case "faq": return { type: "FAQ answered by the office", title: it.row.question, text: snippet(it.row.answer, 1500) };
    case "bin": return { type: "bin", title: it.row.bin_type, text: `${weekdayList(it.row.weekdays)}. ${it.row.put_out_time ?? ""} ${it.row.location ?? ""} ${it.row.notes ?? ""}`.trim() };
    case "document": return { type: "document", title: it.row.title, text: snippet([it.row.description, it.row.extracted_text].filter(Boolean).join("\n"), 1500) };
    case "place": {
      const p = it.row;
      return { type: `local place (${p.place_type})`, title: p.name, text: [p.description, p.address, p.distance_km != null ? `${p.distance_km} km away` : null, p.step_free ? "step-free" : null, p.accessibility_notes].filter(Boolean).join(". "), phone: p.phone, website: p.website };
    }
    case "meeting": {
      const m = it.row;
      return { type: "meeting", title: m.title, when: whenText(m.starts_at, ctx.tz, "en"), status: m.status, where: m.location, agenda: m.agenda, summary: m.minutes?.[0]?.summary ?? null, decisions: m.minutes?.[0]?.decisions ?? [] };
    }
  }
}
