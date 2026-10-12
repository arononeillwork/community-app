import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ContactCard, Source } from "./types";
import type { Doc } from "./text";

/* ---------------------------------------------------------------------------
   Everything the assistant reads, always with the signed-in user's client, so
   Row Level Security decides what can be seen (a tenant never gets admin-only
   documents, other blocks' representatives or anyone's hidden phone number).
   --------------------------------------------------------------------------- */

export type DB = Awaited<ReturnType<typeof createClient>>;

export type InfoRow = { id: string; title: string; body: string; category: string };
export type FaqRow = { id: string; question: string; answer: string };
export type BinRow = {
  id: string; bin_type: string; color: string; weekdays: number[];
  put_out_time: string | null; location: string | null; notes: string | null;
};
export type DocRow = { id: string; title: string; description: string | null; folder: string; extracted_text: string | null };
export type PlaceRow = {
  id: string; name: string; place_type: string; description: string | null; address: string | null;
  distance_km: number | null; phone: string | null; website: string | null; step_free: boolean | null;
  accessibility_notes: string | null;
};
export type MeetingRow = {
  id: string; title: string; meeting_type: string; starts_at: string; duration_minutes: number;
  location: string | null; meeting_url: string | null; status: string; agenda: string | null;
  minutes: { summary: string | null; decisions: string[] }[];
};
export type KeyContactRow = {
  id: string; role_title: string; contact_group: string; name: string | null; organisation: string | null;
  phone: string | null; whatsapp: string | null; email: string | null; hours: string | null; notes: string | null;
  building_id: string | null; sort: number;
};
export type NeighbourRow = {
  building_id: string; building_name: string; unit_label: string; full_name: string; relation: string;
  roles: string[] | null; email: string | null; phone: string | null; preferred_method: string | null;
  best_times: string | null; shared: boolean; is_me: boolean;
};
export type MyReportRow = { id: string; title: string; status: string; priority: string; kind: string; created_at: string };

/** Where a piece of information lives in the app (relative to /<community>). */
export const HREF = {
  info: (id?: string) => (id ? `/info#info-${id}` : "/info"),
  bins: () => "/info",
  document: (id: string) => `/documents/${id}`,
  meeting: (id: string) => `/meetings/${id}`,
  local: () => "/local",
  contacts: () => "/contacts",
  members: () => "/members",
  report: (id: string) => `/report/${id}`,
  reports: () => "/report",
  newReport: () => "/report/new",
  money: () => "/money",
  finance: () => "/finance",
  admin: () => "/admin",
};

export async function loadInfoPages(db: DB, c: string): Promise<InfoRow[]> {
  const { data } = await db.from("info_pages").select("id, title, body, category").eq("community_id", c).order("sort");
  return (data ?? []) as InfoRow[];
}

export async function loadFaq(db: DB, c: string): Promise<FaqRow[]> {
  const { data } = await db.from("faq_entries").select("id, question, answer").eq("community_id", c).order("created_at");
  return (data ?? []) as FaqRow[];
}

export async function loadBins(db: DB, c: string): Promise<BinRow[]> {
  const { data } = await db.from("bin_schedules")
    .select("id, bin_type, color, weekdays, put_out_time, location, notes").eq("community_id", c).order("sort");
  return (data ?? []) as BinRow[];
}

export async function loadDocuments(db: DB, c: string): Promise<DocRow[]> {
  const { data } = await db.from("documents")
    .select("id, title, description, folder, extracted_text").eq("community_id", c).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as DocRow[];
}

export async function loadPlaces(db: DB, c: string): Promise<PlaceRow[]> {
  const { data } = await db.from("local_places")
    .select("id, name, place_type, description, address, distance_km, phone, website, step_free, accessibility_notes")
    .eq("community_id", c).order("distance_km", { nullsFirst: false }).limit(200);
  return (data ?? []) as PlaceRow[];
}

export async function loadMeetings(db: DB, c: string): Promise<{ upcoming: MeetingRow[]; past: MeetingRow[] }> {
  const now = new Date().toISOString();
  const cols = "id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, status, agenda, minutes:meeting_minutes(summary, decisions)";
  const [up, past] = await Promise.all([
    db.from("meetings").select(cols).eq("community_id", c).in("status", ["scheduled", "postponed"])
      .gte("starts_at", now).order("starts_at").limit(5),
    db.from("meetings").select(cols).eq("community_id", c).lt("starts_at", now).neq("status", "cancelled")
      .order("starts_at", { ascending: false }).limit(12),
  ]);
  return { upcoming: (up.data ?? []) as MeetingRow[], past: (past.data ?? []) as MeetingRow[] };
}

export async function loadKeyContacts(db: DB, c: string): Promise<KeyContactRow[]> {
  const { data } = await db.from("key_contacts")
    .select("id, role_title, contact_group, name, organisation, phone, whatsapp, email, hours, notes, building_id, sort")
    .eq("community_id", c).order("sort");
  return (data ?? []) as KeyContactRow[];
}

export async function loadBlockNames(db: DB, c: string): Promise<Map<string, string>> {
  const { data } = await db.rpc("block_summary", { c });
  return new Map(((data ?? []) as { building_id: string; building_name: string }[]).map((b) => [b.building_id, b.building_name]));
}

/** Blocks the user lives in or owns a flat in (empty for an administrator without a flat). */
export async function loadMyBlocks(db: DB, c: string): Promise<{ id: string; name: string }[]> {
  const [{ data: mine }, names] = await Promise.all([db.rpc("my_buildings", { c }), loadBlockNames(db, c)]);
  return ((mine ?? []) as string[]).filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadNeighbours(db: DB, c: string): Promise<NeighbourRow[]> {
  const { data } = await db.rpc("block_directory", { c });
  return (data ?? []) as NeighbourRow[];
}

export async function loadMyReports(db: DB, c: string, userId: string): Promise<MyReportRow[]> {
  const { data } = await db.from("complaints").select("id, title, status, priority, kind, created_at")
    .eq("community_id", c).eq("reporter_id", userId).order("created_at", { ascending: false }).limit(8);
  return (data ?? []) as MyReportRow[];
}

/* ---------------------------------------------------------------- admin / finance */

export type ReportStats = {
  open: number; byStatus: Record<string, number>; urgent: number;
  byCategory: { name: string; count: number }[]; oldest: { id: string; title: string; created_at: string }[];
};

/** Open reports across the community. Only meaningful for administrators (RLS returns only own reports otherwise). */
export async function adminReportStats(db: DB, c: string): Promise<ReportStats> {
  const { data } = await db.from("complaints")
    .select("id, title, status, priority, created_at, category:complaint_categories(name)")
    .eq("community_id", c).in("status", ["new", "acknowledged", "in_progress"]).order("created_at");
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; priority: string; created_at: string; category: { name: string } | null }[];
  const byStatus: Record<string, number> = {};
  const byCat = new Map<string, number>();
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const n = r.category?.name ?? "Other";
    byCat.set(n, (byCat.get(n) ?? 0) + 1);
  }
  return {
    open: rows.length,
    byStatus,
    urgent: rows.filter((r) => r.priority === "urgent" || r.priority === "high").length,
    byCategory: [...byCat.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    oldest: rows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, created_at: r.created_at })),
  };
}

export type ContractDue = {
  id: string; title: string; supplier_name: string; end_date: string | null; notice_deadline: string | null;
  days_to_notice: number | null; days_to_end: number | null; auto_renew: boolean; annual_cost_cents: number;
};

/** Contracts whose notice deadline or end date falls within `days`. Finance roles only (RLS). */
export async function financeContractsDue(db: DB, c: string, days: number): Promise<ContractDue[]> {
  const { data } = await db.from("v_contract_key_dates")
    .select("id, title, supplier_name, end_date, notice_deadline, days_to_notice, days_to_end, auto_renew, annual_cost_cents, status")
    .eq("community_id", c).eq("status", "active").not("end_date", "is", null).order("end_date");
  return ((data ?? []) as (ContractDue & { status: string })[])
    .filter((r) => (r.days_to_end ?? 99999) >= -30 && ((r.days_to_notice ?? 99999) <= days || (r.days_to_end ?? 99999) <= days));
}

export type SpendLine = { category: string; budget_cents: number; actual_cents: number };

/** Budget vs actual per category for a year. Finance roles only (RLS on the view's tables). */
export async function financeSpend(db: DB, c: string, year: number): Promise<{ lines: SpendLine[]; topSuppliers: { name: string; cents: number }[] }> {
  const [bva, sup] = await Promise.all([
    db.from("v_budget_vs_actual").select("category_name, budget_cents, actual_cents").eq("community_id", c).eq("year", year),
    db.from("v_supplier_spend").select("name, spend_this_year_cents").eq("community_id", c)
      .order("spend_this_year_cents", { ascending: false }).limit(5),
  ]);
  return {
    lines: ((bva.data ?? []) as { category_name: string; budget_cents: number; actual_cents: number }[])
      .map((r) => ({ category: r.category_name, budget_cents: Number(r.budget_cents), actual_cents: Number(r.actual_cents) })),
    topSuppliers: ((sup.data ?? []) as { name: string; spend_this_year_cents: number }[])
      .filter((s) => Number(s.spend_this_year_cents) > 0)
      .map((s) => ({ name: s.name, cents: Number(s.spend_this_year_cents) })),
  };
}

/** The resident-level "where the money goes" summary: totals per category, no supplier details. */
export async function publicSpend(db: DB, c: string, year: number): Promise<SpendLine[]> {
  const { data } = await db.rpc("community_spend_summary", { c, yr: year });
  return ((data ?? []) as { category_name: string; budget_cents: number; actual_cents: number }[])
    .map((r) => ({ category: r.category_name, budget_cents: Number(r.budget_cents), actual_cents: Number(r.actual_cents) }));
}

/* ---------------------------------------------------------------- shaping */

export function contactCard(k: KeyContactRow, blockName?: string | null): ContactCard {
  return {
    name: k.name ?? k.organisation ?? k.role_title,
    role: k.role_title + (blockName && !k.role_title.includes(blockName) ? ` · ${blockName}` : ""),
    phone: k.phone,
    whatsapp: k.whatsapp,
    email: k.contact_group === "emergency" ? null : k.email,
    hours: k.hours,
    note: k.notes,
  };
}

export function neighbourCard(n: NeighbourRow): ContactCard {
  return {
    name: n.full_name,
    role: `Flat ${n.unit_label} · ${n.relation === "tenant" ? "resident" : "owner"}`,
    phone: n.shared ? n.phone : null,
    whatsapp: n.shared && n.preferred_method === "whatsapp" ? n.phone : null,
    email: n.shared ? n.email : null,
    hours: n.shared ? n.best_times : null,
  };
}

export type KnowledgeItem =
  | { type: "info"; row: InfoRow }
  | { type: "faq"; row: FaqRow }
  | { type: "bin"; row: BinRow }
  | { type: "document"; row: DocRow }
  | { type: "place"; row: PlaceRow }
  | { type: "meeting"; row: MeetingRow };

export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function weekdayList(days: number[], lang: "en" | "es" = "en"): string {
  const names = lang === "es" ? WEEKDAYS_ES : WEEKDAYS_EN;
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  if (sorted.length === 7) return lang === "es" ? "todos los días" : "every day";
  if (sorted.length === 6 && !days.includes(0)) return lang === "es" ? "de lunes a sábado" : "Monday to Saturday";
  const parts = sorted.map((d) => names[d]);
  if (parts.length === 1) return parts[0];
  const and = lang === "es" ? " y " : " and ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

export function sourceFor(item: KnowledgeItem): Source {
  switch (item.type) {
    case "info": return { kind: "info", label: item.row.title, href: HREF.info(item.row.id) };
    case "faq": return { kind: "faq", label: "Community FAQ", href: null };
    case "bin": return { kind: "bins", label: "Bin days", href: HREF.bins() };
    case "document": return { kind: "document", label: item.row.title, href: HREF.document(item.row.id) };
    case "place": return { kind: "local", label: item.row.name, href: HREF.local() };
    case "meeting": return { kind: "meeting", label: item.row.title, href: HREF.meeting(item.row.id) };
  }
}

/** Everything searchable, as documents for the ranker. */
export function knowledgeDocs(k: {
  info: InfoRow[]; faq: FaqRow[]; bins: BinRow[]; documents: DocRow[]; places: PlaceRow[]; meetings: MeetingRow[];
}): Doc<KnowledgeItem>[] {
  const docs: Doc<KnowledgeItem>[] = [];
  for (const r of k.info) docs.push({ key: `info:${r.id}`, title: r.title, body: r.body, tags: r.category, data: { type: "info", row: r } });
  for (const r of k.faq) docs.push({ key: `faq:${r.id}`, title: r.question, body: r.answer, data: { type: "faq", row: r } });
  for (const r of k.bins) {
    docs.push({
      key: `bin:${r.id}`, title: `${r.bin_type} bin`, tags: `bin ${r.color}`,
      body: [weekdayList(r.weekdays), r.put_out_time, r.location, r.notes].filter(Boolean).join(". "),
      data: { type: "bin", row: r },
    });
  }
  for (const r of k.documents) {
    docs.push({
      key: `doc:${r.id}`, title: r.title, tags: `document ${r.folder}`,
      body: [r.description, r.extracted_text?.slice(0, 4000)].filter(Boolean).join(". "), data: { type: "document", row: r },
    });
  }
  for (const r of k.places) {
    docs.push({
      key: `place:${r.id}`, title: r.name, tags: r.place_type,
      body: [r.description, r.address, r.accessibility_notes].filter(Boolean).join(". "), data: { type: "place", row: r },
    });
  }
  for (const r of k.meetings) {
    const m = r.minutes?.[0];
    docs.push({
      key: `meeting:${r.id}`, title: r.title, tags: `meeting ${r.meeting_type}`,
      body: [r.agenda, m?.summary, ...(m?.decisions ?? [])].filter(Boolean).join(". "), data: { type: "meeting", row: r },
    });
  }
  return docs;
}

export async function loadKnowledge(db: DB, c: string) {
  const [info, faq, bins, documents, places, meetings] = await Promise.all([
    loadInfoPages(db, c), loadFaq(db, c), loadBins(db, c), loadDocuments(db, c), loadPlaces(db, c), loadMeetings(db, c),
  ]);
  return { info, faq, bins, documents, places, meetings: [...meetings.upcoming, ...meetings.past], upcoming: meetings.upcoming, past: meetings.past };
}

export type Knowledge = Awaited<ReturnType<typeof loadKnowledge>>;
