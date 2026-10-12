import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { BlockInfo, DirRow, HeldTitle, UnitLite } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the member pages need, read as the signed-in user. The database decides the scope:
 * residents get their own block(s) only, administrators get every block with all details.
 */
export async function loadPeople(supabase: Client, c: string) {
  const [dir, summary, units, titles] = await Promise.all([
    supabase.rpc("block_directory", { c }),
    supabase.rpc("block_summary", { c }),
    supabase.from("units").select("id, label, floor, bedrooms, building_id").eq("community_id", c).order("label"),
    supabase.from("key_contacts").select("profile_id, role_title, building_id")
      .eq("community_id", c).eq("contact_group", "committee").not("profile_id", "is", null).order("sort"),
  ]);
  if (dir.error) throw new Error(`Could not load members: ${dir.error.message}`);
  if (summary.error) throw new Error(`Could not load blocks: ${summary.error.message}`);
  if (units.error) throw new Error(`Could not load flats: ${units.error.message}`);

  return {
    rows: (dir.data ?? []) as DirRow[],
    blocks: (summary.data ?? []) as BlockInfo[],
    units: (units.data ?? []) as UnitLite[],
    titles: (titles.data ?? []) as HeldTitle[],
  };
}

/** Group committee titles by person for quick lookup. */
export function titlesByPerson(titles: HeldTitle[]) {
  const map = new Map<string, HeldTitle[]>();
  for (const t of titles) map.set(t.profile_id, [...(map.get(t.profile_id) ?? []), t]);
  return map;
}
