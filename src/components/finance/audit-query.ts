import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTION_LABELS, AREA_LABELS } from "./audit";
import { dayStartUtc, isIsoDay, nextIsoDay } from "./dates";

/*
 * Audit log filters, shared by the Audit log page and its CSV export so both read exactly the same rows.
 * Filtering happens in the database, so the whole log can be searched and exported, not only the latest rows.
 */

export type AuditFilters = {
  /** First and last calendar day (YYYY-MM-DD) in the community's time zone. */
  from: string;
  to: string;
  /** audit_log.table_name */
  area: string;
  /** insert | update | delete */
  action: string;
  /** A profile id, or "system" for changes without a person. */
  who: string;
};

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_COLUMNS = "id, at, table_name, record_id, action, actor, old_data, new_data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ["from", "to", "area", "action", "who"] as const;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function read(sp: Params, key: string) {
  const v = sp instanceof URLSearchParams ? sp.get(key) : sp[key];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

/** Only values the log can contain are kept; anything else is ignored rather than failing. */
export function parseAuditFilters(sp: Params): AuditFilters {
  let from = isIsoDay(read(sp, "from")) ? read(sp, "from") : "";
  let to = isIsoDay(read(sp, "to")) ? read(sp, "to") : "";
  if (from && to && from > to) [from, to] = [to, from];
  const area = read(sp, "area");
  const action = read(sp, "action");
  const who = read(sp, "who");
  return {
    from, to,
    area: Object.hasOwn(AREA_LABELS, area) ? area : "",
    action: Object.hasOwn(ACTION_LABELS, action) ? action : "",
    who: who === "system" || UUID.test(who) ? who.toLowerCase() : "",
  };
}

export function activeFilterCount(f: AuditFilters) {
  return KEYS.filter((k) => f[k]).length;
}

/** Query string for the given filters (empty ones left out), plus any extra values such as the page. */
export function auditSearch(f: AuditFilters, extra: Record<string, string | number | null | undefined> = {}) {
  const sp = new URLSearchParams();
  for (const k of KEYS) if (f[k]) sp.set(k, f[k]);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** The community's audit rows matching the filters, read as the signed-in user (RLS: finance users only). */
export function auditQuery(supabase: SupabaseClient, communityId: string, f: AuditFilters, timeZone: string, count?: "exact") {
  let q = supabase.from("audit_log").select(AUDIT_COLUMNS, count ? { count } : undefined).eq("community_id", communityId);
  if (f.from) q = q.gte("at", dayStartUtc(f.from, timeZone));
  if (f.to) q = q.lt("at", dayStartUtc(nextIsoDay(f.to), timeZone));
  if (f.area) q = q.eq("table_name", f.area);
  if (f.action) q = q.eq("action", f.action);
  if (f.who === "system") q = q.is("actor", null);
  else if (f.who) q = q.eq("actor", f.who);
  return q;
}

/** One CSV cell: always quoted, and text that starts like a formula is made inert for spreadsheets. */
export function csvCell(value: unknown) {
  let v = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
