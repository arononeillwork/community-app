import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BlockFlats } from "@/components/admin/FlatSelect";
import { byLabel } from "@/components/admin/format";

/** Flats grouped by block (in block order), for flat pickers. */
export async function flatsByBlock(communityId: string): Promise<BlockFlats[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("id, label, building:buildings(name, sort)").eq("community_id", communityId);
  const groups = new Map<string, { sort: number; flats: { id: string; label: string }[] }>();
  for (const u of (data ?? []) as unknown as { id: string; label: string; building: { name: string; sort: number } | null }[]) {
    const name = u.building?.name ?? "Other flats";
    const g = groups.get(name) ?? { sort: u.building?.sort ?? 999, flats: [] };
    g.flats.push({ id: u.id, label: u.label });
    groups.set(name, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || byLabel(a[0], b[0]))
    .map(([name, g]) => ({ name, flats: g.flats.sort((a, b) => byLabel(a.label, b.label)) }));
}
