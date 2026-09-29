"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember } from "@/lib/community";

export async function toggleVote(slug: string, topicId: string, voted: boolean) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  if (voted) {
    await supabase.from("topic_votes").delete().eq("topic_id", topicId).eq("profile_id", s.userId);
  } else {
    await supabase.from("topic_votes").insert({ topic_id: topicId, community_id: s.community.id, profile_id: s.userId });
  }
  revalidatePath(`/${slug}/meetings`);
}

export async function proposeTopic(slug: string, form: FormData) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (title.length < 3) return;
  const { data } = await supabase.from("meeting_topics")
    .insert({ community_id: s.community.id, title, description: String(form.get("description") ?? "").trim() || null, proposed_by: s.userId })
    .select("id").single();
  // Proposers automatically support their own topic.
  if (data) await supabase.from("topic_votes").insert({ topic_id: data.id, community_id: s.community.id, profile_id: s.userId });
  revalidatePath(`/${slug}/meetings`);
}

export async function setTopicStatus(slug: string, topicId: string, form: FormData) {
  await requireAdmin(slug);
  const supabase = await createClient();
  const status = String(form.get("status"));
  const meetingId = String(form.get("meeting_id") ?? "") || null;
  await supabase.from("meeting_topics").update({ status, meeting_id: status === "open" ? null : meetingId }).eq("id", topicId);
  revalidatePath(`/${slug}/meetings`);
}

export async function rsvp(slug: string, meetingId: string, response: string) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  await supabase.from("meeting_rsvps").upsert({ meeting_id: meetingId, profile_id: s.userId, community_id: s.community.id, response, updated_at: new Date().toISOString() });
  revalidatePath(`/${slug}/meetings/${meetingId}`);
}

export async function saveMeeting(slug: string, form: FormData) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const id = String(form.get("id") ?? "");
  const local = String(form.get("starts_at"));          // "2026-10-12T18:00" in the community's time zone
  const record = {
    community_id: s.community.id,
    title: String(form.get("title")).trim(),
    meeting_type: String(form.get("meeting_type")),
    starts_at: zonedToUtc(local, s.community.timezone),
    duration_minutes: Number(form.get("duration_minutes") || 60),
    location: String(form.get("location") ?? "").trim() || null,
    meeting_url: String(form.get("meeting_url") ?? "").trim() || null,
    agenda: String(form.get("agenda") ?? "").trim() || null,
    status: String(form.get("status") ?? "scheduled"),
  };
  const res = id
    ? await supabase.from("meetings").update(record).eq("id", id).select("id").single()
    : await supabase.from("meetings").insert({ ...record, created_by: s.userId }).select("id").single();
  revalidatePath(`/${slug}/meetings`);
  redirect(`/${slug}/meetings/${res.data?.id ?? ""}`);
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone to a UTC ISO string. */
function zonedToUtc(local: string, timeZone: string) {
  const asUtc = new Date(`${local}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(asUtc).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
}
