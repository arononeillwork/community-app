"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember } from "@/lib/community";

/** Result shown by client forms (useActionState). `values` refills the form after an error. */
export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

const MEETING_TYPES = ["agm", "extraordinary", "committee", "informal"];
const MEETING_STATUSES = ["scheduled", "postponed", "cancelled", "held"];
const RSVPS = ["attending", "online", "not_attending"];
const TOPIC_STATUSES = ["open", "on_agenda", "discussed", "declined"];

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function revalidateMeetings(slug: string, meetingId?: string | null) {
  revalidatePath(`/${slug}/meetings`);
  if (meetingId) revalidatePath(`/${slug}/meetings/${meetingId}`);
  revalidatePath(`/${slug}/home`);
}

// ---------------------------------------------------------------------------
// Suggested topics
// ---------------------------------------------------------------------------

/** Support / stop supporting a topic. The current state is read from the DB, not trusted from the page. */
export async function toggleVote(slug: string, topicId: string) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("topic_votes").select("topic_id")
    .eq("topic_id", topicId).eq("profile_id", s.userId).maybeSingle();
  if (existing) {
    await supabase.from("topic_votes").delete().eq("topic_id", topicId).eq("profile_id", s.userId);
  } else {
    const { data: topic } = await supabase.from("meeting_topics").select("id, status")
      .eq("id", topicId).eq("community_id", s.community.id).maybeSingle();
    // New support is only possible while the topic is still open (also enforced by RLS).
    if (topic?.status === "open") {
      await supabase.from("topic_votes").insert({ topic_id: topicId, community_id: s.community.id, profile_id: s.userId });
    }
  }
  revalidatePath(`/${slug}/meetings`);
}

export async function proposeTopic(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const title = text(form, "title").replace(/\s+/g, " ");
  const description = text(form, "description");
  const values = { title, description };
  if (title.length < 3) return { error: "Please write a short title for your topic (at least 3 letters).", values };
  if (title.length > 200) return { error: "Please keep the title shorter (200 letters at most). You can add more in the details.", values };
  if (description.length > 3000) return { error: "The details are too long. Please shorten them a little.", values };

  // Avoid obvious duplicates: point people to the existing open topic instead.
  const pattern = title.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: same } = await supabase.from("meeting_topics").select("id")
    .eq("community_id", s.community.id).eq("status", "open").ilike("title", pattern).limit(1);
  if (same && same.length > 0) {
    return { error: "This topic has already been suggested. You can find it in the Open list and press “Support this topic”.", values };
  }

  const { data, error } = await supabase.from("meeting_topics")
    .insert({ community_id: s.community.id, title, description: description || null, proposed_by: s.userId })
    .select("id").single();
  if (error || !data) return { error: "Your topic could not be saved. Please try again.", values };

  // Proposers automatically support their own topic.
  await supabase.from("topic_votes").insert({ topic_id: data.id, community_id: s.community.id, profile_id: s.userId });
  revalidatePath(`/${slug}/meetings`);
  return { ok: "Thank you. Your topic has been added, and your support is already counted." };
}

/** Admin: put on the agenda of a meeting / mark discussed / decline / reopen. */
export async function setTopicStatus(slug: string, topicId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const status = text(form, "status");
  if (!TOPIC_STATUSES.includes(status)) return { error: "Please choose what should happen with this topic." };

  const { data: topic } = await supabase.from("meeting_topics").select("id, meeting_id")
    .eq("id", topicId).eq("community_id", s.community.id).maybeSingle();
  if (!topic) return { error: "This topic no longer exists." };

  const update: { status: string; meeting_id?: string | null; admin_note?: string | null } = { status };
  const meetingId = text(form, "meeting_id");

  if (status === "on_agenda" || (status === "discussed" && meetingId)) {
    if (!meetingId) return { error: "Please choose the meeting whose agenda this topic should go on." };
    const { data: meeting } = await supabase.from("meetings").select("id, status")
      .eq("id", meetingId).eq("community_id", s.community.id).maybeSingle();
    if (!meeting) return { error: "That meeting could not be found. Please choose another one." };
    if (status === "on_agenda" && (meeting.status === "cancelled" || meeting.status === "held")) {
      return { error: "That meeting is cancelled or already held. Please choose an upcoming meeting." };
    }
    update.meeting_id = meeting.id;
  } else if (status === "open" || status === "declined") {
    update.meeting_id = null;
  } // "discussed" without a chosen meeting keeps the meeting it was on.

  if (form.has("admin_note")) update.admin_note = text(form, "admin_note").slice(0, 1000) || null;
  if (status === "open") update.admin_note = null;

  const { error } = await supabase.from("meeting_topics").update(update).eq("id", topicId).eq("community_id", s.community.id);
  if (error) return { error: "The topic could not be updated. Please try again." };

  revalidateMeetings(slug, topic.meeting_id);
  if (update.meeting_id && update.meeting_id !== topic.meeting_id) revalidatePath(`/${slug}/meetings/${update.meeting_id}`);
  const done: Record<string, string> = {
    open: "The topic is open again.",
    on_agenda: "The topic is now on the agenda.",
    discussed: "The topic is marked as discussed.",
    declined: "The topic has been declined.",
  };
  return { ok: done[status] };
}

/** Members may delete their own OPEN topic; admins may delete any topic. Requires the confirmation step. */
export async function deleteTopic(slug: string, topicId: string, form: FormData) {
  const s = await requireMember(slug);
  if (form.get("confirm") !== "yes") return;
  const supabase = await createClient();
  const { data: topic } = await supabase.from("meeting_topics").select("id, proposed_by, status, meeting_id")
    .eq("id", topicId).eq("community_id", s.community.id).maybeSingle();
  if (!topic) return;
  const mine = topic.proposed_by === s.userId && topic.status === "open";
  if (!mine && !s.isAdmin) return;
  await supabase.from("meeting_topics").delete().eq("id", topicId).eq("community_id", s.community.id);
  revalidateMeetings(slug, topic.meeting_id);
}

// ---------------------------------------------------------------------------
// RSVP
// ---------------------------------------------------------------------------

export async function rsvp(slug: string, meetingId: string, response: string) {
  const s = await requireMember(slug);
  if (!RSVPS.includes(response)) return;
  const supabase = await createClient();
  const { data: meeting } = await supabase.from("meetings").select("id, status")
    .eq("id", meetingId).eq("community_id", s.community.id).maybeSingle();
  if (!meeting || meeting.status === "cancelled" || meeting.status === "held") return;
  await supabase.from("meeting_rsvps").upsert(
    { meeting_id: meetingId, profile_id: s.userId, community_id: s.community.id, response, updated_at: new Date().toISOString() },
    { onConflict: "meeting_id,profile_id" },
  );
  revalidateMeetings(slug, meetingId);
}

// ---------------------------------------------------------------------------
// Meetings (admin)
// ---------------------------------------------------------------------------

export async function saveMeeting(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();

  const id = text(form, "id");
  const values: Record<string, string> = {};
  for (const k of ["title", "meeting_type", "starts_at", "duration_minutes", "location", "meeting_url", "agenda", "status"]) {
    values[k] = text(form, k);
  }

  const title = values.title.replace(/\s+/g, " ");
  if (title.length < 3) return { error: "Please give the meeting a title.", values };
  if (title.length > 200) return { error: "Please use a shorter title (200 letters at most).", values };
  if (!MEETING_TYPES.includes(values.meeting_type)) return { error: "Please choose the type of meeting.", values };
  const status = values.status || "scheduled";
  if (!MEETING_STATUSES.includes(status)) return { error: "Please choose a status.", values };

  const startsAt = zonedToUtc(values.starts_at, s.community.timezone);
  if (!startsAt) return { error: "Please enter the date and time of the meeting.", values };
  if (!id && new Date(startsAt).getTime() < Date.now() - 60 * 60_000) {
    return { error: "The date and time are in the past. Please check them.", values };
  }

  const duration = Number(values.duration_minutes || 60);
  if (!Number.isInteger(duration) || duration < 15 || duration > 12 * 60) {
    return { error: "Please choose how long the meeting will last.", values };
  }

  const location = values.location || null;
  const meetingUrl = values.meeting_url || null;
  if (meetingUrl && !isHttpUrl(meetingUrl)) {
    return { error: "The meeting link does not look right. Please paste the full link, starting with https://", values };
  }
  if (!location && !meetingUrl) {
    return { error: "Please give a place, an online meeting link, or both, so residents know how to take part.", values };
  }
  if (values.agenda.length > 10000) return { error: "The agenda is too long. Please shorten it.", values };

  const record = {
    title,
    meeting_type: values.meeting_type,
    starts_at: startsAt,
    duration_minutes: duration,
    location,
    meeting_url: meetingUrl,
    agenda: values.agenda || null,
    status,
  };

  let savedId: string;
  let notified: boolean;
  if (id) {
    const { data: before } = await supabase.from("meetings").select("id, starts_at, status, location, meeting_url")
      .eq("id", id).eq("community_id", s.community.id).maybeSingle();
    if (!before) return { error: "This meeting could not be found. It may have been deleted.", values };
    const { data, error } = await supabase.from("meetings").update(record)
      .eq("id", id).eq("community_id", s.community.id).select("id").maybeSingle();
    if (error || !data) return { error: "The meeting could not be saved. Please try again.", values };
    savedId = data.id;
    // Mirrors the DB trigger: residents are told when the time, place, link or status changes.
    notified = new Date(before.starts_at).getTime() !== new Date(startsAt).getTime()
      || before.status !== status || (before.location ?? null) !== location || (before.meeting_url ?? null) !== meetingUrl;
  } else {
    const { data, error } = await supabase.from("meetings")
      .insert({ ...record, community_id: s.community.id, created_by: s.userId }).select("id").single();
    if (error || !data) return { error: "The meeting could not be saved. Please try again.", values };
    savedId = data.id;
    notified = true;
  }

  revalidateMeetings(slug, savedId);
  redirect(`/${slug}/meetings/${savedId}?saved=${notified ? "notified" : "1"}`);
}

/** Admin: cancel a meeting (after the explicit confirmation step). Residents are notified by a DB trigger. */
export async function cancelMeeting(slug: string, meetingId: string, form: FormData) {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return;
  const supabase = await createClient();
  await supabase.from("meetings").update({ status: "cancelled" })
    .eq("id", meetingId).eq("community_id", s.community.id).neq("status", "held");
  revalidateMeetings(slug, meetingId);
}

// ---------------------------------------------------------------------------
// Minutes and action items (admin)
// ---------------------------------------------------------------------------

export async function saveMinutes(slug: string, meetingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const values = {
    summary: text(form, "summary"),
    decisions: text(form, "decisions"),
    recording_url: text(form, "recording_url"),
    document_id: text(form, "document_id"),
  };
  if (values.summary.length > 20000) return { error: "The summary is too long. Please shorten it.", values };
  if (values.recording_url && !isHttpUrl(values.recording_url)) {
    return { error: "The recording link does not look right. Please paste the full link, starting with https://", values };
  }

  const { data: meeting } = await supabase.from("meetings").select("id")
    .eq("id", meetingId).eq("community_id", s.community.id).maybeSingle();
  if (!meeting) return { error: "This meeting could not be found.", values };

  let documentId: string | null = null;
  if (values.document_id) {
    const { data: doc } = await supabase.from("documents").select("id")
      .eq("id", values.document_id).eq("community_id", s.community.id).maybeSingle();
    if (!doc) return { error: "That document could not be found. Please choose another one.", values };
    documentId = doc.id;
  }

  const record = {
    summary: values.summary || null,
    decisions: values.decisions.split(/\r?\n/).map((d) => d.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 100),
    recording_url: values.recording_url || null,
    document_id: documentId,
  };

  const { data: existing } = await supabase.from("meeting_minutes").select("id")
    .eq("meeting_id", meetingId).eq("community_id", s.community.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = existing
    ? await supabase.from("meeting_minutes").update(record).eq("id", existing.id)
    : await supabase.from("meeting_minutes").insert({ ...record, community_id: s.community.id, meeting_id: meetingId });
  if (error) return { error: "The minutes could not be saved. Please try again.", values };

  revalidateMeetings(slug, meetingId);
  return { ok: "The minutes have been saved." };
}

export async function addActionItem(slug: string, meetingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const values = { title: text(form, "title"), owner_name: text(form, "owner_name"), due_date: text(form, "due_date") };
  if (values.title.length < 3) return { error: "Please describe what needs to be done.", values };
  if (values.title.length > 300) return { error: "Please keep the description shorter.", values };
  if (values.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(values.due_date) || Number.isNaN(Date.parse(values.due_date)))) {
    return { error: "Please enter a valid date.", values };
  }
  const { data: meeting } = await supabase.from("meetings").select("id")
    .eq("id", meetingId).eq("community_id", s.community.id).maybeSingle();
  if (!meeting) return { error: "This meeting could not be found.", values };

  const { error } = await supabase.from("action_items").insert({
    community_id: s.community.id,
    meeting_id: meetingId,
    title: values.title,
    owner_name: values.owner_name.slice(0, 120) || null,
    due_date: values.due_date || null,
  });
  if (error) return { error: "The action could not be added. Please try again.", values };
  revalidateMeetings(slug, meetingId);
  return { ok: "The action has been added." };
}

export async function setActionItemStatus(slug: string, itemId: string, status: string) {
  const s = await requireAdmin(slug);
  if (status !== "open" && status !== "done") return;
  const supabase = await createClient();
  const { data } = await supabase.from("action_items").update({ status })
    .eq("id", itemId).eq("community_id", s.community.id).select("meeting_id").maybeSingle();
  revalidateMeetings(slug, data?.meeting_id);
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone to a UTC ISO string (null if invalid). */
function zonedToUtc(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(local);
  if (!m) return null;
  const target = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(target)) return null;
  // Two passes so times near a daylight-saving change land on the right offset.
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - (wallClockAsUtc(guess, timeZone) - guess);
  return new Date(guess).toISOString();
}

/** The wall-clock time shown in `timeZone` at instant `ms`, read back as if it were UTC. */
function wallClockAsUtc(ms: number, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms)).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
