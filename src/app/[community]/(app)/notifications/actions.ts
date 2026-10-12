"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { notificationHref } from "./link";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Open a notification: mark it read, then go to what it is about. */
export async function openNotification(slug: string, id: string) {
  const s = await requireMember(slug);
  if (!UUID.test(id)) redirect(`/${slug}/notifications`);
  const supabase = await createClient();

  const { data: n } = await supabase.from("notifications").select("id, link, read_at")
    .eq("id", id).eq("community_id", s.community.id).eq("profile_id", s.userId).maybeSingle();
  if (!n) redirect(`/${slug}/notifications`);

  if (!n.read_at) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("id", n.id).eq("profile_id", s.userId).is("read_at", null);
    revalidatePath(`/${slug}`, "layout");
  }
  redirect(notificationHref(slug, n.link) ?? `/${slug}/notifications`);
}

export async function markAllRead(slug: string) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("community_id", s.community.id).eq("profile_id", s.userId).is("read_at", null);
  revalidatePath(`/${slug}`, "layout");
}
