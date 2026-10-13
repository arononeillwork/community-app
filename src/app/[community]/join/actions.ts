"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCommunityOr404 } from "@/lib/community";
import { syncPrefCookies } from "../login/actions";

/** Accept every open invitation this person has for the community (usually one). */
export async function acceptInvitations(slug: string) {
  const c = await getCommunityOr404(slug);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${slug}/login?next=${encodeURIComponent(`/${slug}/join`)}`);
  const { data } = await supabase.rpc("my_invitations", { c: c.id });
  for (const inv of (data ?? []) as { id: string }[]) {
    const { error } = await supabase.rpc("accept_invitation", { p_id: inv.id });
    if (error) redirect(`/${slug}/join?error=1`);
  }
  await syncPrefCookies(user.id);
  redirect(`/${slug}/home`);
}

export async function declineInvitations(slug: string) {
  const c = await getCommunityOr404(slug);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_invitations", { c: c.id });
  for (const inv of (data ?? []) as { id: string }[]) await supabase.rpc("decline_invitation", { p_id: inv.id });
  redirect(`/${slug}/join?declined=1`);
}
