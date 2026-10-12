import "server-only";
import { randomUUID } from "crypto";
import type { AskContext } from "./context";
import type { DB } from "./data";
import { normalize, tokenSet, hasAny } from "./text";
import type { PendingReport, PendingStatus, ReportDraft } from "./types";

/* ---------------------------------------------------------------------------
   Reports drafted by the assistant. A draft is a pending_actions row; nothing
   reaches the office until the resident presses Confirm (confirmDraft).
   --------------------------------------------------------------------------- */

export const DRAFT_TTL_HOURS = 24;

const CATEGORY_BY_CONCEPT: [string[], string][] = [
  [["leak", "lift", "maintenance", "intercom"], "Maintenance"],
  [["emergency"], "Safety"],
  [["noise"], "Noise"],
  [["pet"], "Pets"],
  [["garage"], "Parking"],
  [["cleaning", "bin"], "Cleanliness"],
  [["report", "pool", "garden", "key", "remote"], "Maintenance"],
];

export function guessCategory(text: string): string {
  const q = tokenSet(text);
  for (const [concepts, name] of CATEGORY_BY_CONCEPT) if (hasAny(q, ...concepts)) return name;
  return "Other";
}

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Validate and tidy a draft from any source (Claude's tool input or the keyword parser). */
export function sanitizeDraft(input: Partial<ReportDraft>): ReportDraft | null {
  const title = clean(input.title, 120);
  const description = String(input.description ?? "").trim().slice(0, 2000);
  if (title.length < 3 || description.length < 3) return null;
  const location = clean(input.location, 120) || null;
  const category = clean(input.category, 40) || guessCategory(`${title} ${description}`);
  return {
    kind: input.kind === "complaint" ? "complaint" : "incident",
    title: title[0].toUpperCase() + title.slice(1),
    description,
    location,
    category,
    urgent: !!input.urgent,
  };
}

const REPORT_VERBS =
  /^(?:(?:please|por favor)\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:i\s+(?:want|would like|d like|need)\s+to|quiero|quisiera|necesito)\s+)?(?:report|log|reportar|reporta|avisar(?:\s+de)?|avisa(?:\s+de)?|informar(?:\s+de)?|informa(?:\s+de)?|notificar|notifica)\b\s*(?:(?:that|que)\s+)?/i;
const THERE_IS = /^(?:there\s+is|there\s+s|theres|there\s+are|hay)\b/i;
const BROKEN =
  /\b(?:is|are)\s+(?:broken|not\s+working|leaking|blocked|stuck|flooded|out\s+of\s+order|overflowing)\b|\b(?:isn\s?t|aren\s?t|doesn\s?t|don\s?t)\s+work|\bno\s+funciona|\besta\s+rot[oa]\b|\bse\s+ha\s+roto|\bestropead[oa]|\baveriad[oa]|\bhay\s+una\s+fuga/i;
const QUESTION_START =
  /^(?:how|what|where|who|when|which|why|can\s+i|could\s+i|should\s+i|do\s+i|does|is|are|como|que|donde|quien|cuando|cual|puedo|se\s+puede|debo)\b/i;
const PROBLEM = ["leak", "lift", "maintenance", "intercom", "report", "noise", "emergency", "garage", "cleaning", "bin", "pet", "garden", "pool", "key", "remote"];

/**
 * Does the question describe a specific problem to report ("Report a leak in the Block B stairs",
 * "The lift in Block A is not working")? Returns a draft, or null for questions such as
 * "How do I report a leak?".
 */
export function parseReportRequest(question: string): ReportDraft | null {
  const asked = /[?¿]/.test(question);
  const raw = question.trim().replace(/^[¿¡]+/, "").replace(/[?!.]+$/, "").trim();
  const n = normalize(raw);
  const asksHowTo = QUESTION_START.test(n) && !/^(?:can|could|would|will)\s+you\b/.test(n);
  if (asksHowTo) return null;
  const q = tokenSet(raw);
  if (!hasAny(q, ...PROBLEM)) return null;

  // Keep the resident's own wording (capitals such as "Block B", apostrophes such as "doesn't").
  // Patterns run on a copy with apostrophes flattened to spaces: same length, so positions match.
  const text = raw.replace(/\s+/g, " ");
  const lite = text.replace(/[’']/g, " ");
  const verb = REPORT_VERBS.exec(lite);
  // "¿Hay recogida de basura mañana?" / "There's a pool party tonight?" are questions, not reports:
  // without a "please report" verb, only a statement of something broken counts when it ends in "?".
  // "Hay recogida de basura mañana" asks about the bin schedule.
  const schedule = /\b(?:collection|collections|collected|recogida|recogen|recoge)\b/.test(n);
  const statement = (THERE_IS.test(n) && !asked && !schedule) || BROKEN.test(n);
  if (!verb && !statement) return null;

  // What is left once the "please report" / "there is" part is gone is the problem itself.
  let what = verb ? text.slice(verb[0].length) : text;
  what = what
    .replace(/^(?:there(?:\s+|\s*[’']\s*)s|there\s+is|there\s+are|hay)\s+/i, "")
    .replace(/^(?:a|an|the|un|una|unos|unas|el|la|los|las)\s+/i, "")
    .trim();
  if (what.split(/\s+/).length < 2) return null;

  const loc =
    /\b(?:in|at|on|near|outside|by|en|junto\s+a|cerca\s+de|delante\s+de)\s+((?:the\s+|el\s+|la\s+|los\s+|las\s+|my\s+|mi\s+)?[^,.;]{2,60}?)(?=\s+(?:is|are|isn|aren|has|have|keeps|since|for|esta|no|se|desde)\b|[,.;]|$)/i
      .exec(what);
  const location = loc ? loc[1].replace(/^(?:the|el|la|los|las)\s+/i, "").trim() : null;
  const urgent = hasAny(q, "leak", "emergency") || /\b(?:urgent|stuck|trapped|flood|atrapad[oa]|urgente)\b/i.test(n);
  const complaintish = hasAny(q, "noise", "pet", "cleaning") || (hasAny(q, "garage") && !hasAny(q, "leak", "maintenance", "remote"));

  // The title is the first clause ("Leak in the Block B stairs"); the full wording goes in the description.
  const clause = what.split(/[,.;:!?]\s/)[0].trim();
  const title = clause.split(/\s+/).length >= 2 ? clause : what;
  return sanitizeDraft({
    kind: complaintish ? "complaint" : "incident",
    title: title.length > 80 ? title.slice(0, title.lastIndexOf(" ", 80)) : title,
    description: raw,
    location,
    urgent,
  });
}

function toPending(id: string, status: PendingStatus, d: ReportDraft, reportId?: string | null): PendingReport {
  return { id, status, kind: d.kind, title: d.title, description: d.description, location: d.location, category: d.category, urgent: d.urgent, reportId: reportId ?? null };
}

/** Store a draft for the resident to confirm. */
export async function createDraft(ctx: AskContext, draft: ReportDraft): Promise<PendingReport | null> {
  const { data, error } = await ctx.db.from("pending_actions").insert({
    community_id: ctx.s.community.id,
    profile_id: ctx.s.userId,
    action_type: "create_complaint",
    payload: draft,
  }).select("id").single();
  if (error || !data) return null;
  return toPending(data.id as string, "pending", draft);
}

type PendingRow = { id: string; status: PendingStatus; payload: ReportDraft & { report_id?: string }; created_at: string };

export function pendingFromRow(r: PendingRow): PendingReport | null {
  const d = sanitizeDraft(r.payload);
  return d ? toPending(r.id, r.status, d, r.payload.report_id ?? null) : null;
}

export async function loadPending(db: DB, communityId: string, userId: string, ids: string[]): Promise<Map<string, PendingReport>> {
  const out = new Map<string, PendingReport>();
  if (!ids.length) return out;
  const { data } = await db.from("pending_actions").select("id, status, payload, created_at")
    .eq("community_id", communityId).eq("profile_id", userId).in("id", ids);
  for (const r of (data ?? []) as PendingRow[]) {
    const p = pendingFromRow(r);
    if (!p) continue;
    if (p.status === "pending" && Date.now() - new Date(r.created_at).getTime() > DRAFT_TTL_HOURS * 3600000) p.status = "expired";
    out.set(r.id, p);
  }
  return out;
}

/** Send a confirmed draft to the office as a report. Re-validates everything; the claim makes double clicks harmless. */
export async function confirmDraft(db: DB, communityId: string, userId: string, id: string):
  Promise<{ ok: true; pending: PendingReport } | { ok: false; error: string; pending?: PendingReport }> {
  const { data: row } = await db.from("pending_actions").select("id, status, payload, created_at, action_type")
    .eq("id", id).eq("community_id", communityId).eq("profile_id", userId).maybeSingle();
  if (!row || row.action_type !== "create_complaint") return { ok: false, error: "That draft could not be found." };
  const current = pendingFromRow(row as PendingRow);
  if (!current) return { ok: false, error: "That draft is incomplete. Please use Report a problem instead." };
  if (current.status !== "pending") return { ok: true, pending: current };
  if (Date.now() - new Date(row.created_at as string).getTime() > DRAFT_TTL_HOURS * 3600000) {
    await db.from("pending_actions").update({ status: "expired" }).eq("id", id).eq("status", "pending");
    return { ok: false, error: "This draft is more than a day old. Ask again to start a new report.", pending: { ...current, status: "expired" } };
  }

  // Claim the draft first so a second click cannot send it twice.
  const { data: claimed } = await db.from("pending_actions").update({ status: "confirmed" })
    .eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (!claimed) {
    const { data: again } = await db.from("pending_actions").select("id, status, payload, created_at").eq("id", id).maybeSingle();
    const p = again ? pendingFromRow(again as PendingRow) : null;
    return p ? { ok: true, pending: p } : { ok: false, error: "That draft could not be found." };
  }

  const d = sanitizeDraft(row.payload as ReportDraft)!;
  const { data: cat } = await db.from("complaint_categories").select("id")
    .eq("community_id", communityId).eq("name", d.category ?? "Other").maybeSingle();
  const reportId = randomUUID();
  const { error } = await db.from("complaints").insert({
    id: reportId,
    community_id: communityId,
    kind: d.kind,
    category_id: cat?.id ?? null,
    target_type: "common_area",
    location: d.location,
    title: d.title,
    description: d.description,
    priority: d.urgent ? "urgent" : "normal",
  });
  if (error) {
    await db.from("pending_actions").update({ status: "pending" }).eq("id", id).eq("status", "confirmed");
    return { ok: false, error: "Your report could not be sent. Please try again.", pending: current };
  }
  await db.from("pending_actions").update({ payload: { ...d, report_id: reportId } }).eq("id", id);
  return { ok: true, pending: { ...current, status: "confirmed", reportId } };
}

export async function cancelDraft(db: DB, communityId: string, userId: string, id: string):
  Promise<{ ok: true; pending: PendingReport } | { ok: false; error: string }> {
  await db.from("pending_actions").update({ status: "rejected" })
    .eq("id", id).eq("community_id", communityId).eq("profile_id", userId).eq("status", "pending");
  const { data } = await db.from("pending_actions").select("id, status, payload, created_at")
    .eq("id", id).eq("community_id", communityId).eq("profile_id", userId).maybeSingle();
  const p = data ? pendingFromRow(data as PendingRow) : null;
  return p ? { ok: true, pending: p } : { ok: false, error: "That draft could not be found." };
}
