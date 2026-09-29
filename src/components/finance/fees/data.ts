import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Read every row of a query, 1000 at a time (the API returns at most 1000 rows per request).
 * `build(from, to)` must return the query with `.range(from, to)` applied and a stable order.
 */
export async function fetchAll<T>(build: (from: number, to: number) => Page<T>, max = 20000): Promise<{ rows: T[]; error: unknown }> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) return { rows, error };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < size) break;
  }
  return { rows, error: null };
}

/**
 * Display names for people in this community, as the signed-in user (RLS applies).
 * profiles is readable for yourself and for admins; the directory() function gives every
 * member's name to other members (so a treasurer can see names too).
 */
export async function communityNames(supabase: Client, communityId: string, alsoIds: (string | null | undefined)[] = []) {
  const names = new Map<string, string>();
  const { data: people } = await supabase.rpc("directory", { c: communityId });
  for (const p of (people ?? []) as { profile_id: string; full_name: string | null }[]) {
    if (p.profile_id && p.full_name?.trim()) names.set(p.profile_id, p.full_name.trim());
  }
  const missing = Array.from(new Set(alsoIds.filter((v): v is string => !!v && !names.has(v)))).slice(0, 200);
  if (missing.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name?.trim()) names.set(p.id, p.full_name.trim());
    }
  }
  return names;
}

/**
 * Current owners of every flat: unit id -> owner names.
 * v_unit_balance.owner_names joins profiles, which a treasurer (not admin) cannot read, so it is
 * often empty for them. Here the names come from unit_ownerships + the member directory instead,
 * with the view's names as a fallback.
 */
export async function ownersByUnit(
  supabase: Client, communityId: string, today: string, fallback?: Map<string, string | null>,
) {
  const { rows } = await fetchAll<{ unit_id: string; owner_id: string; end_date: string | null }>((from, to) =>
    supabase.from("unit_ownerships").select("unit_id, owner_id, end_date")
      .eq("community_id", communityId).or(`end_date.is.null,end_date.gte.${today}`)
      .order("id").range(from, to));
  const names = await communityNames(supabase, communityId, rows.map((r) => r.owner_id));
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const n = names.get(r.owner_id);
    if (!n) continue;
    const list = out.get(r.unit_id) ?? [];
    if (!list.includes(n)) list.push(n);
    out.set(r.unit_id, list);
  }
  if (fallback) {
    for (const [unitId, text] of fallback) {
      if (!out.has(unitId) && text?.trim()) out.set(unitId, text.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return out;
}
