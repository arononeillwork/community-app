import "server-only";
import { createClient } from "@/lib/supabase/server";
import { byLabel, dayInput } from "@/components/admin/format";

export type Person = { id: string; name: string };
export type FlatRow = {
  id: string; label: string; floor: number | null; bedrooms: number | null; coefficient: number;
  buildingId: string | null; owners: Person[]; tenants: Person[];
};
export type Block = { id: string; name: string; sort: number; flats: FlatRow[] };

/** Every block with its flats, owners and current tenants (read as the administrator; RLS applies). */
export async function loadBlocks(communityId: string, timeZone: string) {
  const supabase = await createClient();
  const today = dayInput(timeZone);
  const [{ data: buildings }, { data: units }, { data: owns }, { data: tens }] = await Promise.all([
    supabase.from("buildings").select("id, name, sort").eq("community_id", communityId).order("sort").order("name"),
    supabase.from("units").select("id, label, floor, bedrooms, coefficient, building_id").eq("community_id", communityId),
    supabase.from("unit_ownerships").select("unit_id, owner:profiles(id, full_name)").eq("community_id", communityId)
      .or(`end_date.is.null,end_date.gte.${today}`),
    supabase.from("tenancies").select("unit_id, tenant:profiles!tenancies_tenant_id_fkey(id, full_name)")
      .eq("community_id", communityId).eq("status", "active"),
  ]);

  const flats = new Map<string, FlatRow>();
  for (const u of units ?? []) {
    flats.set(u.id, {
      id: u.id, label: u.label, floor: u.floor, bedrooms: u.bedrooms, coefficient: Number(u.coefficient),
      buildingId: u.building_id, owners: [], tenants: [],
    });
  }
  for (const o of (owns ?? []) as unknown as { unit_id: string; owner: { id: string; full_name: string } | null }[]) {
    if (o.owner) flats.get(o.unit_id)?.owners.push({ id: o.owner.id, name: o.owner.full_name });
  }
  for (const t of (tens ?? []) as unknown as { unit_id: string; tenant: { id: string; full_name: string } | null }[]) {
    if (t.tenant) flats.get(t.unit_id)?.tenants.push({ id: t.tenant.id, name: t.tenant.full_name });
  }

  const all = [...flats.values()].sort((a, b) => byLabel(a.label, b.label));
  const blocks: Block[] = (buildings ?? []).map((b) => ({ id: b.id, name: b.name, sort: b.sort, flats: all.filter((f) => f.buildingId === b.id) }));
  const loose = all.filter((f) => !f.buildingId || !blocks.some((b) => b.id === f.buildingId));
  const total = all.reduce((sum, f) => sum + f.coefficient, 0);
  return { blocks, loose, all, total };
}

/** Shares are stored with four decimals, so allow a rounding difference of 0.01 %. */
export function sharesAddUp(total: number) {
  return Math.abs(total - 100) <= 0.01;
}
