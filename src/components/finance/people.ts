import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Names of the community's members, keyed by profile id, for "who approved / who changed" columns.
 * Treasurers cannot read other profiles directly; directory() returns every active member's name
 * to any member (contact details stay subject to each person's sharing choice and are not used here).
 */
export async function getPeopleNames(supabase: SupabaseClient, communityId: string) {
  const { data } = await supabase.rpc("directory", { c: communityId });
  const names = new Map<string, string>();
  for (const p of (data ?? []) as { profile_id: string; full_name: string | null }[]) {
    if (p.full_name) names.set(p.profile_id, p.full_name);
  }
  return names;
}

/** Display name for an actor id: the person's name, "System" for imports and scheduled jobs. */
export function personName(names: Map<string, string>, id: string | null | undefined) {
  if (!id) return "System";
  return names.get(id) ?? "Former member";
}
