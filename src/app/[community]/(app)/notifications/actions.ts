"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/community";
import { inAppPath } from "@/components/info/links";

async function setRead(communityId: string, profileId: string, id?: string) {
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("community_id", communityId).eq("profile_id", profileId).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
}

/** Mark every unread alert in this community as read. */
export async function markAllRead(slug: string) {
  const s = await requireMember(slug);
  await setRead(s.community.id, s.userId);
  revalidatePath(`/${slug}`, "layout"); // the header badge shows the unread count on every page
}

/** Mark one alert as read without leaving the page. */
export async function markRead(slug: string, id: string) {
  const s = await requireMember(slug);
  await setRead(s.community.id, s.userId, id);
  revalidatePath(`/${slug}`, "layout");
}

/** Mark one alert as read, then go to the page it points to. */
export async function openNotification(slug: string, id: string) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, link")
    .eq("id", id).eq("community_id", s.community.id).eq("profile_id", s.userId).maybeSingle();
  await setRead(s.community.id, s.userId, id);
  revalidatePath(`/${slug}`, "layout");
  redirect(inAppPath(slug, data?.link as string | null) ?? `/${slug}/notifications`);
}
