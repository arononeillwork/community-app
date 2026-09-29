import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Look up display names for profile ids, as the signed-in user (RLS applies).
 * 1. profiles: readable for yourself, and for admins of the community.
 * 2. directory(c): the member directory, which shows every active member's name to other members
 *    (this is how a treasurer sees an admin's name).
 * Ids that stay unknown are simply missing from the map; callers show a neutral label instead.
 */
export async function lookupNames(supabase: Client, communityId: string, ids: (string | null | undefined)[]) {
  const wanted = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", wanted);
  for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
    if (p.full_name?.trim()) names.set(p.id, p.full_name.trim());
  }

  if (wanted.some((id) => !names.has(id))) {
    const { data: people } = await supabase.rpc("directory", { c: communityId });
    for (const p of (people ?? []) as { profile_id: string; full_name: string | null }[]) {
      if (!names.has(p.profile_id) && p.full_name?.trim() && wanted.includes(p.profile_id)) {
        names.set(p.profile_id, p.full_name.trim());
      }
    }
  }
  return names;
}
