import "server-only";
import { type AskContext, dateText, euros, weekdayIn, whenText, yearIn } from "./context";
import {
  HREF, WEEKDAYS_EN, WEEKDAYS_ES, adminReportStats, contactCard, financeContractsDue, financeSpend, knowledgeDocs,
  loadBins, loadKeyContacts, loadKnowledge, loadMeetings, loadMyBlocks, loadMyReports, loadNeighbours, neighbourCard,
  publicSpend, sourceFor, weekdayList,
  type BinRow, type KeyContactRow, type Knowledge, type KnowledgeItem, type MeetingRow, type SpendLine,
} from "./data";
import { createDraft, parseReportRequest } from "./reports";
import { hasAny, normalize, rank, snippet, tokenSet, words, type Hit } from "./text";
import type { AnswerCard, AnswerMeta, ContactCard, Lang, Source } from "./types";

/* ---------------------------------------------------------------------------
   The assistant without an API key: deterministic answers from the community's
   own data. A few common intents (bins, meetings, contacts, reporting a problem,
   money) get purpose-built answers; everything else goes through ranked search
   over info pages, the FAQ, documents, local places and meetings.
   --------------------------------------------------------------------------- */

export type EngineAnswer = { text: string; meta: AnswerMeta; unanswered: boolean };

type Reply = { intro: string; cards?: AnswerCard[]; contacts?: ContactCard[]; sources?: Source[]; pending?: AnswerMeta["pending"] };

const STATUS_EN: Record<string, string> = { new: "new", acknowledged: "seen by the office", in_progress: "in progress", resolved: "resolved", closed: "closed" };
const STATUS_ES: Record<string, string> = { new: "nueva", acknowledged: "vista por la oficina", in_progress: "en curso", resolved: "resuelta", closed: "cerrada" };

export async function answerWithoutAI(ctx: AskContext, question: string): Promise<EngineAnswer> {
  const lang = ctx.lang;
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  const q = tokenSet(question);
  const w = new Set(words(question));
  const n = normalize(question);

  const done = (p: Reply, unanswered = false): EngineAnswer => finish(p, lang, unanswered);

  // Nothing searchable: a greeting or a thank-you.
  if (q.size === 0) {
    if (/\b(thanks|thank|gracias|cheers)\b/.test(n)) return done({ intro: t("You're welcome.", "De nada.") });
    if (/\b(hi|hello|hey|hola|buenos|buenas|good)\b/.test(n) || !n) {
      return done({ intro: t(
        "Hello. Ask me about bin days, meetings, the pool, who to call, or how to report a problem.",
        "Hola. Pregúnteme por los días de recogida, las reuniones, la piscina, a quién llamar o cómo informar de un problema.",
      ) });
    }
  }

  // 1. "Report a leak in the Block B stairs": draft it for the resident to confirm.
  const draft = parseReportRequest(question);
  if (draft) {
    const pending = await createDraft(ctx, draft);
    if (pending) {
      const contacts = (await staffContacts(ctx)).slice(0, 1);
      return done({
        intro: t(
          "I've written this up as a report. Check it, then press Confirm and send to pass it to the office.",
          "He preparado este aviso. Revíselo y pulse Confirmar y enviar para mandarlo a la oficina.",
        ) + (draft.urgent ? " " + t("If water is spreading or anyone is in danger, call the concierge now.", "Si el agua se extiende o alguien corre peligro, llame ahora al conserje.") : ""),
        pending,
        contacts: draft.urgent ? contacts : [],
        sources: [{ kind: "report", label: t("Report a problem", "Informar de un problema"), href: HREF.newReport() }],
      });
    }
  }

  // 2. My reports.
  const mine = (w.has("my") || w.has("mis") || w.has("mi")) && hasAny(q, "report");
  const reportStatus = hasAny(q, "report") && /\b(status|estado|update|news|novedades|how many|cuantas|cuantos)\b|\b(open|outstanding|pending) (reports|complaints|problems)\b|\b(avisos|incidencias|quejas) (abiertas|abiertos|pendientes)\b/.test(n);
  if (mine || (reportStatus && !ctx.s.isAdmin)) {
    return done(await myReports(ctx));
  }

  // 3. Administrators: open report numbers.
  if (ctx.s.isAdmin && hasAny(q, "report") && /\b(how many|open|stats|statistics|summary|overview|outstanding|pending|cuantas|cuantos|abiertas|pendientes|resumen)\b/.test(n)) {
    return done(await reportStats(ctx));
  }

  // 4. Bins.
  const binTypes = ["glass", "paper", "plastic", "organic"].filter((c) => q.has(c));
  if (q.has("general") && q.has("bin")) binTypes.push("general");
  const dayAsked = askedDay(n, ctx);
  const binQuestion = q.has("bin") || (binTypes.length > 0 && (dayAsked !== null || /\b(when|day|days|collected|collection|put out|which|what day|cuando|dia|dias|recoge|recogen|recogida|sacar|where|donde)\b/.test(n)));
  if (binQuestion && !hasAny(q, "meeting", "report")) {
    return done(await bins(ctx, binTypes, dayAsked));
  }

  // 5. Meetings.
  if (q.has("meeting")) {
    const past = /\b(last|previous|past|minutes|decided|decide|decisions|agreed|held|ultima|ultimo|anterior|actas|acta|acordo|acordaron|decidio|decidieron)\b/.test(n);
    const type = /\b(agm|annual|anual|general)\b/.test(n) ? "agm" : /\b(committee|comite|junta directiva)\b/.test(n) ? "committee" : null;
    return done(await meetings(ctx, past, type));
  }

  // 6. Money: contracts and spending.
  if (q.has("contract") && /\b(end|ends|ending|expire|expires|expiring|renew|renews|renewal|notice|due|cancel|soon|upcoming|vence|vencen|renovar|renovacion|caduca|caducan|termina|terminan|preaviso)\b/.test(n)) {
    return done(await contracts(ctx));
  }
  if (q.has("budget") && !hasAny(q, "fee")) {
    return done(await spending(ctx, question));
  }

  // 7. Who to contact. "Who is…", "phone of…", a flat, the block representative or an emergency go straight to
  //    people; a question that only mentions a role ("Can the concierge take my parcels?") is searched first.
  const peopleRole = hasAny(q, ...PERSON_ROLES, "neighbour");
  const contactWords = q.has("contact") || /\b(who|whom|quien|quienes)\b/.test(n);
  const flat = flatLabel(question);
  if (contactWords || flat || hasAny(q, "representative", "emergency")) {
    const c = await contacts(ctx, question, q, flat, contactWords);
    if (c) return done(c);
  } else if (peopleRole) {
    const k = await loadKnowledge(ctx.db, ctx.s.community.id);
    const hits = search(question, k);
    if (hits.length) {
      const people = await roleContacts(ctx, q);
      return done(found(ctx, question, hits, people, people.length ? [{ kind: "contacts", label: t("Key contacts", "Contactos"), href: HREF.contacts() }] : []));
    }
    const c = await contacts(ctx, question, q, flat, contactWords);
    if (c) return done(c);
  }

  // 8. How do I report a problem / what do I do about a leak?
  if (hasAny(q, "report", "leak")) {
    return done(await reportHowTo(ctx, question, q));
  }

  // 9. Everything else: search the community's information.
  const k = await loadKnowledge(ctx.db, ctx.s.community.id);
  const hits = search(question, k);
  if (hits.length) {
    return done(found(ctx, question, hits, hits.flatMap((h) => placeContact(h.doc.data, lang)).slice(0, 2), []));
  }

  // 10. Nothing matched: say so, point to people, and flag the question for the office.
  const help = await staffContacts(ctx);
  return done({
    intro: t(
      `I couldn't find that in ${possessive(ctx.s.community.name)} information. I've passed your question to the office so they can add an answer. For something urgent, call the concierge.`,
      `No he encontrado eso en la información de ${ctx.s.community.name}. He pasado su pregunta a la oficina para que añadan la respuesta. Si es urgente, llame al conserje.`,
    ),
    contacts: help,
    sources: [{ kind: "contacts", label: t("Key contacts", "Contactos"), href: HREF.contacts() }],
  }, true);
}

/* ---------------------------------------------------------------- helpers */

/** Search results as answer cards. A complaint ("my neighbour is very noisy at night") also gets the report form. */
function found(ctx: AskContext, question: string, hits: Hit<KnowledgeItem>[], contacts: ContactCard[], extra: Source[]): Reply {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const complaint = hasAny(tokenSet(question), "noise", "pet", "cleaning") && !/[?¿]/.test(question) && !QUESTION_WORDS.test(normalize(question));
  const report: Source[] = complaint ? [{ kind: "report", label: t("Report a problem", "Informar de un problema"), href: HREF.newReport() }] : [];
  return {
    intro: complaint
      ? t("Here's what I found. If it keeps happening, you can report it to the office.", "Esto es lo que he encontrado. Si se repite, puede informar a la oficina.")
      : t("Here's what I found.", "Esto es lo que he encontrado."),
    cards: hits.map((h) => cardFor(h, question, ctx)),
    contacts,
    sources: dedupe([...hits.map((h) => sourceFor(h.doc.data)), ...report, ...extra]),
  };
}

const QUESTION_WORDS = /^(?:how|what|whats|where|who|when|which|why|can|could|should|may|do|does|is|are|will|como|que|donde|quien|cuando|cual|puedo|se puede|hay)\b/;

function finish(p: Reply, lang: Lang, unanswered: boolean): EngineAnswer {
  const parts = [p.intro];
  for (const c of p.cards ?? []) parts.push(`${c.title}\n${c.body}`);
  for (const c of p.contacts ?? []) {
    const how = [c.phone, c.email].filter(Boolean).join(", ");
    parts.push(`${c.name}${c.role ? ` (${c.role})` : ""}${how ? `: ${how}` : ""}`);
  }
  if (p.pending) parts.push(`${p.pending.title}${p.pending.location ? ` · ${p.pending.location}` : ""}`);
  return {
    text: parts.filter(Boolean).join("\n\n"),
    unanswered,
    meta: {
      engine: "retrieval",
      lang,
      intro: p.intro,
      cards: p.cards?.length ? p.cards : undefined,
      contacts: p.contacts?.length ? p.contacts : undefined,
      sources: p.sources?.length ? dedupe(p.sources) : undefined,
      pending: p.pending,
      unanswered: unanswered || undefined,
    },
  };
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function dedupe(sources: Source[]): Source[] {
  // Several places all link to /local: one chip named after the page, not after the first place.
  const local = sources.filter((s) => s.kind === "local").length;
  if (local > 1) sources = sources.map((s) => (s.kind === "local" ? { ...s, label: "Local area" } : s));
  const seen = new Set<string>();
  return sources.filter((s) => {
    const k = `${s.kind}|${s.href ?? s.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

const DAY_WORDS: [RegExp, number][] = [
  [/\b(sunday|sundays|domingo|domingos)\b/, 0], [/\b(monday|mondays|lunes)\b/, 1], [/\b(tuesday|tuesdays|martes)\b/, 2],
  [/\b(wednesday|wednesdays|miercoles)\b/, 3], [/\b(thursday|thursdays|jueves)\b/, 4], [/\b(friday|fridays|viernes)\b/, 5],
  [/\b(saturday|saturdays|sabado|sabados)\b/, 6],
];

/** "tomorrow", "today", "on Thursday", "mañana" → { day, label } in the community's time zone. */
function askedDay(n: string, ctx: AskContext): { day: number; label: string } | null {
  const es = ctx.lang === "es";
  const names = es ? WEEKDAYS_ES : WEEKDAYS_EN;
  if (/\b(today|tonight|hoy|esta noche)\b/.test(n)) {
    const d = weekdayIn(ctx.tz, ctx.now);
    return { day: d, label: es ? `hoy (${names[d]})` : `today (${names[d]})` };
  }
  if (/\btomorrow\b/.test(n) || (/\bmanana\b/.test(n) && !/\b(la|esta|por la) manana\b/.test(n))) {
    const d = weekdayIn(ctx.tz, ctx.now, 1);
    return { day: d, label: es ? `mañana (${names[d]})` : `tomorrow (${names[d]})` };
  }
  for (const [re, d] of DAY_WORDS) if (re.test(n)) return { day: d, label: es ? `el ${names[d]}` : `on ${names[d]}` };
  return null;
}

function binConcepts(b: BinRow): Set<string> {
  return tokenSet(`${b.bin_type} ${b.color}`);
}

/** "on Thursday", "every day", "Monday to Saturday" / "el jueves", "todos los días". */
function binDays(b: BinRow, lang: Lang): string {
  const days = weekdayList(b.weekdays, lang);
  if (b.weekdays.length >= 6) return days;
  if (lang === "es") return b.weekdays.length === 1 ? `el ${days}` : `los ${days}`;
  return `on ${days}`;
}

/** "glass (green)", "organic (food waste, brown)". */
function binName(b: BinRow): string {
  const name = b.bin_type.toLowerCase();
  return name.endsWith(")") ? `${name.slice(0, -1)}, ${b.color})` : `${name} (${b.color})`;
}

function binLine(b: BinRow, lang: Lang): string {
  const lines = [lang === "es" ? `Se recoge ${binDays(b, lang)}.` : `Collected ${binDays(b, lang)}.`];
  if (b.put_out_time) lines.push((lang === "es" ? "Horario: " : "Put out: ") + b.put_out_time + ".");
  if (b.location) lines.push(b.location + ".");
  if (b.notes) lines.push(b.notes);
  return lines.join(" ").replace(/\.\./g, ".");
}

async function bins(ctx: AskContext, types: string[], day: { day: number; label: string } | null): Promise<Reply> {
  const lang = ctx.lang;
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  const all = await loadBins(ctx.db, ctx.s.community.id);
  const source: Source = { kind: "bins", label: t("Bin days", "Días de recogida"), href: HREF.bins() };
  if (!all.length) {
    return { intro: t("The bin schedule hasn't been added yet. The concierge can tell you.", "Aún no se ha publicado el calendario de recogida. El conserje se lo puede decir."), contacts: await staffContacts(ctx) };
  }
  const chosen = types.length ? all.filter((b) => types.some((c) => binConcepts(b).has(c))) : [];
  const title = (b: BinRow) => `${b.bin_type} · ${b.color}`;

  if (chosen.length && day) {
    const yes = chosen.filter((b) => b.weekdays.includes(day.day));
    const no = chosen.filter((b) => !b.weekdays.includes(day.day));
    const intro = [
      yes.length ? t(`Yes, ${list(yes.map((b) => b.bin_type.toLowerCase()), lang)} ${yes.length > 1 ? "are" : "is"} collected ${day.label}.`, `Sí, ${list(yes.map((b) => b.bin_type.toLowerCase()), lang)} se recoge ${day.label}.`) : "",
      no.length ? t(`${cap(list(no.map((b) => b.bin_type.toLowerCase()), lang))} ${no.length > 1 ? "aren't" : "isn't"} collected ${day.label}.`, `${cap(list(no.map((b) => b.bin_type.toLowerCase()), lang))} no se recoge ${day.label}.`) : "",
    ].filter(Boolean).join(" ");
    return { intro, cards: chosen.map((b) => ({ title: title(b), body: binLine(b, lang), source })), sources: [source] };
  }
  if (chosen.length) {
    const first = chosen[0];
    const intro = chosen.length === 1
      ? t(`${first.bin_type} is collected ${binDays(first, lang)}.`, `${first.bin_type}: se recoge ${binDays(first, lang)}.`)
      : t("Here are the collection days.", "Estos son los días de recogida.");
    return { intro, cards: chosen.map((b) => ({ title: title(b), body: binLine(b, lang), source })), sources: [source] };
  }
  if (day) {
    const that = all.filter((b) => b.weekdays.includes(day.day));
    if (!that.length) return { intro: t(`No bins are collected ${day.label}.`, `${cap(day.label)} no hay recogida.`), sources: [source] };
    return {
      intro: t(`Collected ${day.label}: ${list(that.map(binName), lang)}.`,
               `${cap(day.label)} se recoge: ${list(that.map(binName), lang)}.`),
      cards: that.map((b) => ({ title: title(b), body: binLine(b, lang), source })),
      sources: [source],
    };
  }
  return {
    intro: t("Here is the bin schedule.", "Este es el calendario de recogida."),
    cards: [{
      title: t("Bin days", "Días de recogida"),
      body: all.map((b) => `- ${b.bin_type} (${b.color}): ${weekdayList(b.weekdays, lang)}${b.put_out_time ? ` · ${b.put_out_time}` : ""}`).join("\n"),
      source,
    }],
    sources: [source],
  };
}

function list(items: string[], lang: Lang) {
  if (items.length <= 1) return items[0] ?? "";
  return items.slice(0, -1).join(", ") + (lang === "es" ? " y " : " and ") + items[items.length - 1];
}
function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function meetingCard(m: MeetingRow, ctx: AskContext, past: boolean): AnswerCard {
  const lang = ctx.lang;
  const where = m.location ?? (m.meeting_url ? (lang === "es" ? "En línea (el enlace está en la página de la reunión)" : "Online (the link is on the meeting page)") : null);
  const lines = [whenText(m.starts_at, ctx.tz, lang) + (where ? ` · ${where}` : "")];
  if (m.status === "postponed") lines.push(lang === "es" ? "Aplazada: se confirmará una nueva fecha." : "Postponed: a new date will be confirmed.");
  if (past) {
    const mm = m.minutes?.[0];
    if (mm?.summary) lines.push(mm.summary);
    if (mm?.decisions?.length) lines.push(mm.decisions.map((d) => `- ${d}`).join("\n"));
  } else if (m.agenda) {
    const items = m.agenda.split("\n").map((x) => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean).slice(0, 4);
    if (items.length) lines.push((lang === "es" ? "Orden del día: " : "Agenda: ") + items.join("; ") + ".");
  }
  return { title: m.title, body: lines.join("\n"), source: { kind: "meeting", label: m.title, href: HREF.meeting(m.id) } };
}

async function meetings(ctx: AskContext, past: boolean, type: string | null): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const loaded = await loadMeetings(ctx.db, ctx.s.community.id);
  const ofType = (list: MeetingRow[]) => (type ? list.filter((m) => m.meeting_type === type) : list);
  const upcoming = ofType(loaded.upcoming);
  // For "what was decided", prefer meetings with minutes.
  const held = [...ofType(loaded.past)].sort((a, b) => Number(!!b.minutes?.[0]?.summary) - Number(!!a.minutes?.[0]?.summary));
  const all: Source = { kind: "meeting", label: t("Meetings", "Reuniones"), href: "/meetings" };
  if (past) {
    const last = held[0];
    if (!last) return { intro: t("There are no past meetings on record yet.", "Todavía no hay reuniones anteriores registradas."), sources: [all] };
    const card = meetingCard(last, ctx, true);
    const decided = last.minutes?.[0]?.decisions?.length;
    return {
      intro: decided
        ? t(`This is what was decided at the ${last.title}.`, `Esto es lo que se decidió en la reunión ${last.title}.`)
        : t(`The last meeting was ${last.title}.`, `La última reunión fue ${last.title}.`),
      cards: [card],
      sources: [card.source!],
    };
  }
  if (!upcoming.length) {
    return { intro: t("No meetings are planned at the moment. New meetings appear under Meetings and you'll get an alert.", "No hay reuniones previstas por ahora. Las nuevas aparecen en Reuniones y recibirá un aviso."), sources: [all] };
  }
  const next = upcoming[0];
  const cards = upcoming.slice(0, 2).map((m) => meetingCard(m, ctx, false));
  return {
    intro: t(`The next meeting is ${next.title}, ${whenText(next.starts_at, ctx.tz, "en")}.`, `La próxima reunión es ${next.title}, el ${whenText(next.starts_at, ctx.tz, "es")}.`),
    cards,
    sources: cards.map((c) => c.source!),
  };
}

async function myReports(ctx: AskContext): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const rows = await loadMyReports(ctx.db, ctx.s.community.id, ctx.s.userId);
  const yours: Source = { kind: "reports", label: t("Your reports", "Sus avisos"), href: HREF.reports() };
  if (!rows.length) {
    return {
      intro: t("You haven't reported anything yet. If something is broken or bothering you, you can report it here or ask me to do it.", "Todavía no ha enviado ningún aviso. Si algo está roto o le molesta, puede informar aquí o pedirme que lo haga."),
      sources: [{ kind: "report", label: t("Report a problem", "Informar de un problema"), href: HREF.newReport() }],
    };
  }
  const names = ctx.lang === "es" ? STATUS_ES : STATUS_EN;
  const open = rows.filter((r) => !["resolved", "closed"].includes(r.status));
  return {
    intro: open.length
      ? t(`You have ${open.length} open ${open.length === 1 ? "report" : "reports"}.`, `Tiene ${open.length} ${open.length === 1 ? "aviso abierto" : "avisos abiertos"}.`)
      : t("All your reports are resolved.", "Todos sus avisos están resueltos."),
    cards: [{
      title: t("Your latest reports", "Sus últimos avisos"),
      body: rows.slice(0, 5).map((r) => `- ${r.title}: ${names[r.status] ?? r.status} (${dateText(r.created_at, ctx.tz, ctx.lang)})`).join("\n"),
      source: yours,
    }],
    sources: [yours, ...rows.slice(0, 2).map((r) => ({ kind: "report" as const, label: r.title, href: HREF.report(r.id) }))],
  };
}

async function reportStats(ctx: AskContext): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const st = await adminReportStats(ctx.db, ctx.s.community.id);
  const src: Source = { kind: "reports", label: t("Reports", "Avisos"), href: HREF.reports() };
  if (!st.open) return { intro: t("There are no open reports. Everything has been dealt with.", "No hay avisos abiertos."), sources: [src] };
  const lines = [
    t(`New: ${st.byStatus.new ?? 0} · Seen: ${st.byStatus.acknowledged ?? 0} · In progress: ${st.byStatus.in_progress ?? 0}`,
      `Nuevos: ${st.byStatus.new ?? 0} · Vistos: ${st.byStatus.acknowledged ?? 0} · En curso: ${st.byStatus.in_progress ?? 0}`),
    st.byCategory.slice(0, 4).map((c) => `- ${c.name}: ${c.count}`).join("\n"),
  ];
  if (st.oldest.length) lines.push(t("Oldest: ", "Más antiguo: ") + `${st.oldest[0].title} (${dateText(st.oldest[0].created_at, ctx.tz, ctx.lang)})`);
  return {
    intro: t(`There are ${st.open} open reports${st.urgent ? `, ${st.urgent} of them high priority` : ""}.`,
             `Hay ${st.open} avisos abiertos${st.urgent ? `, ${st.urgent} de prioridad alta` : ""}.`),
    cards: [{ title: t("Open reports", "Avisos abiertos"), body: lines.join("\n"), source: src }],
    sources: [src, ...st.oldest.slice(0, 1).map((o) => ({ kind: "report" as const, label: o.title, href: HREF.report(o.id) }))],
  };
}

async function contracts(ctx: AskContext): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const c = ctx.s.community.id;
  if (ctx.s.isFinance) {
    const due = await financeContractsDue(ctx.db, c, 120);
    const src: Source = { kind: "finance", label: t("Contracts", "Contratos"), href: "/finance/contracts" };
    if (!due.length) return { intro: t("No contract reaches its notice deadline or end date in the next four months.", "Ningún contrato llega a su fecha de preaviso o de fin en los próximos cuatro meses."), sources: [src] };
    return {
      intro: t(`${due.length} ${due.length === 1 ? "contract needs" : "contracts need"} attention in the next four months.`, `${due.length} ${due.length === 1 ? "contrato requiere" : "contratos requieren"} atención en los próximos cuatro meses.`),
      cards: [{
        title: t("Contracts ending soon", "Contratos que vencen pronto"),
        body: due.slice(0, 6).map((r) => `- ${r.title} (${r.supplier_name}): ${t("ends", "vence")} ${r.end_date ? dateText(r.end_date, ctx.tz, ctx.lang) : "–"}` +
          (r.notice_deadline ? ` · ${t("notice by", "preaviso antes del")} ${dateText(r.notice_deadline, ctx.tz, ctx.lang)}` : "") +
          (r.auto_renew ? ` · ${t("renews automatically", "renovación automática")}` : "")).join("\n"),
        source: src,
      }],
      sources: [src],
    };
  }
  const { data } = await ctx.db.rpc("community_contracts_public", { c });
  const rows = ((data ?? []) as { supplier_name: string; service_type: string; title: string; end_date: string | null }[])
    .filter((r) => r.end_date).sort((a, b) => a.end_date!.localeCompare(b.end_date!));
  const src: Source = { kind: "money", label: t("Where the money goes", "En qué se gasta"), href: HREF.money() };
  if (!rows.length) return { intro: t("There are no contracts with an end date on record.", "No hay contratos con fecha de fin registrados."), sources: [src] };
  return {
    intro: t("These are the community's current contracts and when they end.", "Estos son los contratos actuales de la comunidad y cuándo vencen."),
    cards: [{ title: t("Current contracts", "Contratos actuales"), body: rows.slice(0, 6).map((r) => `- ${r.service_type}: ${r.supplier_name}, ${t("ends", "vence")} ${dateText(r.end_date!, ctx.tz, ctx.lang)}`).join("\n"), source: src }],
    sources: [src],
  };
}

async function spending(ctx: AskContext, question: string): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const yearMatch = /\b(20\d\d)\b/.exec(question);
  const thisYear = yearIn(ctx.tz, ctx.now);
  const year = yearMatch ? Number(yearMatch[1]) : /\b(last year|ano pasado)\b/.test(normalize(question)) ? thisYear - 1 : thisYear;
  const finance = ctx.s.isFinance;
  const [lines, extra] = finance
    ? await financeSpend(ctx.db, ctx.s.community.id, year).then((r) => [r.lines, r.topSuppliers] as const)
    : [await publicSpend(ctx.db, ctx.s.community.id, year), [] as { name: string; cents: number }[]] as const;
  const src: Source = finance
    ? { kind: "finance", label: t("Finance", "Finanzas"), href: HREF.finance() }
    : { kind: "money", label: t("Where the money goes", "En qué se gasta"), href: HREF.money() };
  if (!lines.length) return { intro: t(`There are no spending figures for ${year} yet.`, `Aún no hay cifras de gasto para ${year}.`), sources: [src] };

  const qTokens = tokenSet(question);
  const focus = lines.filter((l) => [...tokenSet(l.category)].some((x) => qTokens.has(x)));
  const fmt = (l: SpendLine) => `${l.category}: ${euros(l.actual_cents, ctx.lang, ctx.s.community.currency)} ${t("spent", "gastado")}` +
    (l.budget_cents ? ` ${t("of", "de")} ${euros(l.budget_cents, ctx.lang, ctx.s.community.currency)} (${Math.round((l.actual_cents / l.budget_cents) * 100)}%)` : "");
  if (focus.length) {
    return {
      intro: focus.length === 1
        ? t(`In ${year}, ${focus[0].category.toLowerCase()} has cost ${euros(focus[0].actual_cents, "en", ctx.s.community.currency)} so far${focus[0].budget_cents ? `, against a budget of ${euros(focus[0].budget_cents, "en", ctx.s.community.currency)}` : ""}.`,
            `En ${year}, ${focus[0].category.toLowerCase()} lleva ${euros(focus[0].actual_cents, "es", ctx.s.community.currency)} gastados${focus[0].budget_cents ? ` de un presupuesto de ${euros(focus[0].budget_cents, "es", ctx.s.community.currency)}` : ""}.`)
        : t(`Spending in ${year}:`, `Gasto en ${year}:`),
      cards: [{ title: t(`Spending ${year}`, `Gasto ${year}`), body: focus.map((l) => `- ${fmt(l)}`).join("\n"), source: src }],
      sources: [src],
    };
  }
  const spent = lines.reduce((a, l) => a + l.actual_cents, 0);
  const budget = lines.reduce((a, l) => a + l.budget_cents, 0);
  const top = [...lines].sort((a, b) => b.actual_cents - a.actual_cents).slice(0, 5);
  const body = [top.map((l) => `- ${fmt(l)}`).join("\n")];
  if (finance && extra.length) body.push(t("Largest suppliers: ", "Mayores proveedores: ") + extra.slice(0, 3).map((s) => `${s.name} (${euros(s.cents, ctx.lang, ctx.s.community.currency)})`).join(", ") + ".");
  return {
    intro: t(`In ${year} the community has spent ${euros(spent, "en", ctx.s.community.currency)}${budget ? ` of a ${euros(budget, "en", ctx.s.community.currency)} budget` : ""}.`,
             `En ${year} la comunidad ha gastado ${euros(spent, "es", ctx.s.community.currency)}${budget ? ` de un presupuesto de ${euros(budget, "es", ctx.s.community.currency)}` : ""}.`),
    cards: [{ title: t(`Largest costs ${year}`, `Mayores gastos ${year}`), body: body.join("\n"), source: src }],
    sources: [src],
  };
}

/** A flat label such as "B-3C" or "b 3c" in the question. */
function flatLabel(question: string): string | null {
  const m = /\b([A-Za-z])\s?-?\s?(\d{1,2})\s?([A-Za-z])\b/.exec(question);
  if (!m || !/^[a-z]$/i.test(m[1])) return null;
  // Avoid matching ordinary words: require a dash/space form like "B-3C" or "A2B".
  return `${m[1].toUpperCase()}-${m[2]}${m[3].toUpperCase()}`;
}

async function staffContacts(ctx: AskContext): Promise<ContactCard[]> {
  const all = await loadKeyContacts(ctx.db, ctx.s.community.id);
  const concierge = all.find((k) => k.contact_group === "staff" && !k.building_id && (k.phone || k.whatsapp));
  const office = all.find((k) => k.contact_group === "management" && /office/i.test(k.role_title)) ?? all.find((k) => k.contact_group === "management");
  return [concierge, office].filter((k): k is KeyContactRow => !!k).map((k) => contactCard(k));
}

const PERSON_ROLES = ["president", "vicepresident", "secretary", "treasurer", "concierge", "representative", "office", "emergency"];

/** Key contacts whose role the question names (the concierge, the office, the president…). */
async function roleContacts(ctx: AskContext, q: Set<string>): Promise<ContactCard[]> {
  const roles = PERSON_ROLES.filter((r) => q.has(r) && r !== "representative" && r !== "emergency");
  if (!roles.length) return [];
  const all = await loadKeyContacts(ctx.db, ctx.s.community.id);
  return all
    .filter((k) => !k.building_id && roles.some((r) => tokenSet(k.role_title).has(r)) && !(roles.includes("president") && /vice/i.test(k.role_title)))
    .sort((a, b) => Number(/office/i.test(b.role_title)) - Number(/office/i.test(a.role_title)))
    .slice(0, 1)
    .map((k) => contactCard(k));
}

async function contacts(ctx: AskContext, question: string, q: Set<string>, flat: string | null, askedForPerson: boolean): Promise<Reply | null> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const c = ctx.s.community.id;
  const [all, myBlocks] = await Promise.all([loadKeyContacts(ctx.db, c), loadMyBlocks(ctx.db, c)]);
  const blockName = new Map(myBlocks.map((b) => [b.id, b.name]));
  const keySrc: Source = { kind: "contacts", label: t("Key contacts", "Contactos"), href: HREF.contacts() };
  const memSrc: Source = { kind: "members", label: t("Members", "Vecinos"), href: HREF.members() };

  // Block representative(s): RLS returns only the reps of the user's own block(s); administrators see all.
  if (q.has("representative")) {
    const reps = all.filter((k) => k.building_id);
    if (!reps.length) {
      return {
        intro: ctx.s.isAdmin
          ? t("No block representatives have been added yet. You can add them under Key contacts.", "Aún no se han añadido representantes de bloque. Puede añadirlos en Contactos.")
          : myBlocks.length
            ? t("Your block doesn't have a representative listed yet. The office can help in the meantime.", "Su bloque aún no tiene representante. Mientras tanto, la oficina le puede ayudar.")
            : t("You're not linked to a flat yet, so I can't tell which block is yours. The office can add you.", "Aún no está vinculado a ninguna vivienda. La oficina puede añadirle."),
        contacts: await staffContacts(ctx),
        sources: [keySrc],
      };
    }
    // "Block A representative": narrow to the block named, when it is one the user can see.
    const named = /\b(?:block|bloque)\s+([a-z0-9]{1,3})\b/i.exec(question)?.[1]?.toLowerCase();
    const narrowed = named ? reps.filter((k) => new RegExp(`\\b${named}\\b`, "i").test(k.role_title)) : [];
    const shown = (narrowed.length ? narrowed : reps).slice(0, 3);
    const first = shown[0];
    const otherBlock = !!named && !narrowed.length && !ctx.s.isAdmin;
    return {
      intro: (otherBlock ? t("I can only show the representative for your own block. ", "Solo puedo mostrar el representante de su propio bloque. ") : "") + (shown.length === 1
        ? ctx.s.isAdmin
          ? t(`The ${roleText(first.role_title)} is ${first.name ?? first.organisation}.`, `${first.role_title}: ${first.name ?? first.organisation}.`)
          : t(`Your ${first.role_title.replace(/\s*representative$/i, "")} representative is ${first.name ?? first.organisation}.`,
              `El representante de su bloque es ${first.name ?? first.organisation}.`)
        : ctx.s.isAdmin
          ? t("Here are the block representatives.", "Estos son los representantes de bloque.")
          : t("Here are the representatives for your blocks.", "Estos son los representantes de sus bloques.")),
      contacts: shown.map((k) => contactCard(k)),
      sources: [keySrc],
    };
  }

  // A particular flat: neighbours in the user's own block(s) only (block_directory enforces this).
  if (flat) {
    const people = (await loadNeighbours(ctx.db, c)).filter((p) => p.unit_label === flat);
    if (!people.length) {
      return {
        intro: ctx.s.isAdmin
          ? t(`Nobody is registered in flat ${flat}.`, `No hay nadie registrado en la vivienda ${flat}.`)
          : t(`I can only show neighbours in your own block, and flat ${flat} isn't one of them. The office can pass on a message.`,
              `Solo puedo mostrar vecinos de su propio bloque y la vivienda ${flat} no está en él. La oficina puede pasar un mensaje.`),
        contacts: ctx.s.isAdmin ? [] : await staffContacts(ctx),
        sources: [memSrc],
      };
    }
    const hidden = people.some((p) => !p.shared);
    return {
      intro: t(`Flat ${flat}: ${list(people.map((p) => p.full_name), "en")}.`, `Vivienda ${flat}: ${list(people.map((p) => p.full_name), "es")}.`) +
        (hidden ? " " + t("Some people keep their details private; the office can pass on a message.", "Algunas personas no comparten sus datos; la oficina puede pasar un mensaje.") : ""),
      contacts: dedupeContacts(people.map(neighbourCard)).slice(0, 4),
      sources: [memSrc],
    };
  }

  // Emergencies: 112 first, then the emergency lines the community lists.
  if (q.has("emergency") && !hasAny(q, "lift", "leak", "president", "concierge", "office")) {
    const lines = all.filter((k) => k.contact_group === "emergency").slice(0, 3);
    return {
      intro: t("In an emergency call 112 for police, fire or an ambulance.", "En una emergencia llame al 112 (policía, bomberos o ambulancia)."),
      contacts: lines.map((k) => contactCard(k)),
      sources: [keySrc],
    };
  }

  // Role, service or name: rank key contacts by role title, name, organisation and notes.
  const docs = all.map((k) => ({
    key: k.id,
    title: `${k.role_title} ${k.name ?? ""} ${k.organisation ?? ""}`,
    tags: k.contact_group,
    body: k.notes ?? "",
    data: k,
  }));
  let hits = rank(question, docs, { limit: 4, minCoverage: 0.34, ignore: ["contact", "hours"] });
  // "president" must not pick the vice-president.
  if (q.has("president") && !q.has("vicepresident")) hits = hits.filter((h) => !/vice/i.test(h.doc.data.role_title));
  // Prefer contacts whose role title uses the resident's own word ("office", "pool", "concierge").
  const lit = (x: string) => x.replace(/ies$/, "y").replace(/s$/, "");
  const qWords = words(question).filter((x) => x.length >= 4).map(lit);
  const direct = (k: KeyContactRow) => normalize(k.role_title).split(" ").some((x) => x.length >= 4 && qWords.includes(lit(x)));
  hits.sort((a, b) => Number(direct(b.doc.data)) - Number(direct(a.doc.data)) || b.score - a.score);
  const best = hits[0]?.score ?? 0;
  hits = hits.filter((h) => h.score >= best * 0.6 || direct(h.doc.data));

  if (!hits.length) {
    // Neighbours by name, in the user's own block(s) only.
    const asked = words(question).filter((x) => x.length >= 3);
    const people = await loadNeighbours(ctx.db, c);
    const found = dedupeContacts(people
      .filter((p) => !p.is_me && normalize(p.full_name).split(" ").some((part) => part.length >= 3 && asked.includes(part)))
      .map(neighbourCard)).slice(0, 3);
    if (found.length) {
      const privateOne = found.length === 1 && !found[0].phone && !found[0].email;
      return {
        intro: (found.length === 1 ? `${found[0].name}: ${found[0].role}.` : t("Here are the neighbours I found in your block.", "Estos son los vecinos que he encontrado en su bloque.")) +
          (privateOne ? " " + t("Their contact details are private. The office can pass on a message.", "Sus datos de contacto son privados. La oficina puede pasar un mensaje.") : ""),
        contacts: found,
        sources: [memSrc],
      };
    }
    // Only answer "I couldn't find that person" when the question was clearly about a person.
    if (!askedForPerson) return null;
    return {
      intro: t("I couldn't find that person. The office or the concierge can help.", "No he encontrado a esa persona. La oficina o el conserje le pueden ayudar."),
      contacts: await staffContacts(ctx),
      sources: [keySrc],
    };
  }

  const top = hits.map((h) => h.doc.data);
  const first = top[0];
  const single = top.length === 1 || (direct(first) && !direct(top[1])) || hits[0].score > hits[1].score * 1.5;
  const who = first.name ?? first.organisation ?? first.role_title;
  const org = first.organisation && first.name ? ` (${first.organisation})` : "";
  let intro: string;
  if (!single) intro = t("Here's who to contact.", "Estos son los contactos.");
  else if (hasAny(q, "hours") && first.hours) intro = `${first.role_title}: ${first.hours}.`;
  else if (first.contact_group === "emergency") intro = `${first.role_title}: ${first.phone ?? first.email ?? ""}.`;
  else if (first.contact_group === "committee" || first.contact_group === "staff") intro = t(`${who} is the ${roleText(first.role_title)}${org}.`, `${first.role_title}: ${who}${org}.`);
  else intro = `${first.role_title}: ${who}${org}.`;
  if (q.has("emergency")) intro += " " + t("In a life-threatening emergency call 112.", "En una emergencia grave llame al 112.");

  return {
    intro,
    contacts: (single ? top.slice(0, 1) : top.slice(0, 3)).map((k) => contactCard(k, k.building_id ? blockName.get(k.building_id) : null)),
    sources: [keySrc],
  };
}

/** "President" → "president", but "Block B representative" stays as it is. */
function roleText(role: string) {
  return /^(Block|Bloque)\b/.test(role) ? role : role[0].toLowerCase() + role.slice(1);
}

function dedupeContacts(list: ContactCard[]) {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

async function reportHowTo(ctx: AskContext, question: string, q: Set<string>): Promise<Reply> {
  const t = (en: string, es: string) => (ctx.lang === "es" ? es : en);
  const k = await loadKnowledge(ctx.db, ctx.s.community.id);
  const leak = q.has("leak");
  const cards: AnswerCard[] = [];
  if (leak) {
    const page = k.info.find((p) => tokenSet(`${p.title} ${p.body}`).has("leak"));
    if (page) cards.push({ title: page.title, body: bestLines(page.body, question + " leak water", 3), source: sourceFor({ type: "info", row: page }) });
  }
  cards.push({
    title: t("Report a problem", "Informar de un problema"),
    body: t(
      "Open Report a problem, give it a short title, say where it is and add a photo if you can. The office replies on the report page.\nYou can also ask me, for example: Report a leak in the Block B stairs.",
      "Abra Informar de un problema, ponga un título corto, indique dónde está y añada una foto si puede. La oficina responde en la página del aviso.\nTambién me lo puede pedir, por ejemplo: Informar de una fuga en la escalera del bloque B.",
    ),
    source: { kind: "report", label: t("Report a problem", "Informar de un problema"), href: HREF.newReport() },
  });
  const staff = (await staffContacts(ctx)).slice(0, 1);
  return {
    intro: leak
      ? t("For a water leak, turn off the water at the stopcock if you can, then call the concierge. Then report it so the office can follow up.",
          "Si hay una fuga de agua, cierre la llave de paso si puede y llame al conserje. Después infórmelo para que la oficina haga el seguimiento.")
      : t("You can report it in the app. The office sees it straight away.", "Puede informar desde la aplicación. La oficina lo verá enseguida."),
    cards,
    contacts: staff,
    sources: cards.map((c) => c.source!).filter(Boolean),
  };
}

/* ---------------------------------------------------------------- search */

function search(question: string, k: Knowledge): Hit<KnowledgeItem>[] {
  // "Neighbour"/"resident" is in nearly everything written for residents; on its own it says little
  // ("my neighbour is noisy at night" is about noise, not the welcome guide for new residents).
  const ignore = tokenSet(question).size > 1 ? ["neighbour"] : [];
  const hits = rank(question, knowledgeDocs(k), { limit: 4, minCoverage: 0.42, ignore });
  if (!hits.length) return [];
  const [top] = hits;
  // Two or more words we know nothing about ("paint", "red") and a weak match: better to say we don't know.
  if (top.unknown >= 2 && top.coverage < 0.6) return [];
  // A partial match only in the body of a page ("front" and "door" in the parking page) is not an answer.
  if (top.inTitle === 0 && top.coverage < 0.6) return [];
  // Keep only answers about as complete as the best one ("pool hours" should not also bring up a pool party),
  // and only one of two sources with the same name (the "House rules" page and the "House rules 2026" document).
  const kept: Hit<KnowledgeItem>[] = [];
  for (const h of hits) {
    if (kept.length && (h.score < top.score * 0.55 || h.coverage < top.coverage - 0.15 || h.inTitle === 0)) continue;
    const words = tokenSet(h.doc.title);
    const same = kept.some((k) => {
      const other = tokenSet(k.doc.title);
      const shared = [...words].filter((x) => other.has(x)).length;
      return shared > 0 && shared >= Math.min(words.size, other.size) * 0.6;
    });
    if (!same) kept.push(h);
  }
  return kept.slice(0, 3);
}

/** The lines of a long text that best match the question, in their original order. */
function bestLines(text: string, question: string, max = 2): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= max) return lines.join("\n");
  const q = tokenSet(question);
  const scored = lines.map((l, i) => ({ l, i, s: [...tokenSet(l)].filter((x) => q.has(x)).length }));
  const top = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max);
  if (!top.length) return scored.slice(0, max).map((x) => x.l).join("\n");
  // Room left: add the line after a match. It is often the instruction that follows a lead-in
  // ("Furniture must never be left in the bin area." → "Book the free council collection on 010.").
  for (const x of [...top]) {
    const next = scored[x.i + 1];
    if (top.length < max && next && !top.includes(next)) top.push(next);
  }
  return top.sort((a, b) => a.i - b.i).map((x) => x.l).join("\n");
}

function cardFor(h: Hit<KnowledgeItem>, question: string, ctx: AskContext): AnswerCard {
  const it = h.doc.data;
  const lang = ctx.lang;
  const source = sourceFor(it);
  switch (it.type) {
    case "info": return { title: it.row.title, body: bestLines(it.row.body, question, 2), source };
    case "faq": return { title: it.row.question, body: it.row.answer, source };
    case "bin": return { title: `${it.row.bin_type} · ${it.row.color}`, body: binLine(it.row, lang), source };
    case "document": {
      const text = it.row.extracted_text?.replace(/^#+\s*/gm, "").replace(/\*\*/g, "") ?? null;
      const body = [it.row.description, text ? snippet(bestLines(text, question, 2), 320) : null].filter(Boolean).join("\n");
      return { title: it.row.title, body: body || (lang === "es" ? "Documento de la comunidad." : "Community document."), source };
    }
    case "place": {
      const p = it.row;
      const facts = [
        p.address,
        p.distance_km != null ? `${String(p.distance_km).replace(".", lang === "es" ? "," : ".")} km` : null,
        p.step_free ? (lang === "es" ? "Sin escalones" : "Step-free") : null,
      ].filter(Boolean).join(" · ");
      return { title: p.name, body: [p.description, facts, p.accessibility_notes].filter(Boolean).join("\n"), source };
    }
    case "meeting": {
      const past = new Date(it.row.starts_at) < ctx.now;
      return meetingCard(it.row, ctx, past);
    }
  }
}

function placeContact(it: KnowledgeItem, lang: Lang): ContactCard[] {
  if (it.type !== "place" || !it.row.phone) return [];
  const type = it.row.place_type.replace(/_/g, " ");
  return [{ name: it.row.name, role: lang === "es" ? null : type[0].toUpperCase() + type.slice(1), phone: it.row.phone, whatsapp: null, email: null, hours: null }];
}
