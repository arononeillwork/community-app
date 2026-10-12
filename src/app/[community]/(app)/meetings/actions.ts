"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember } from "@/lib/community";
import {
  MEETING_STATUSES, MEETING_TYPES, RSVP_OPTIONS, TOPIC_STATUSES, UUID_RE, hasEnded, hasStarted, isWebUrl, lines,
} from "@/components/meetings/meeting-utils";

/* Every action re-checks the role, validates on the server and takes community_id from the session.
   RLS stays the real guard: all reads and writes use the signed-in user's client. */

export type ActionResult = { error?: string };
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
  /** Changes on every successful submit so forms can reset themselves. */
  okAt?: number;
} | undefined;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function refresh(slug: string, ...meetingIds: (string | null | undefined)[]) {
  revalidatePath(`/${slug}/meetings`);
  revalidatePath(`/${slug}/home`);
  for (const id of new Set(meetingIds.filter(Boolean))) revalidatePath(`/${slug}/meetings/${id}`);
}

async function findMeeting(communityId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("meetings")
    .select("id, status, starts_at, duration_minutes")
    .eq("id", id).eq("community_id", communityId).maybeSingle();
  return data as { id: string; status: string; starts_at: string; duration_minutes: number } | null;
}

/* ------------------------------------------------------------------ topics */

export async function toggleVote(slug: string, topicId: string, voted: boolean): Promise<ActionResult> {
  const s = await requireMember(slug);
  if (!UUID_RE.test(topicId)) return { error: "This topic no longer exists." };
  const supabase = await createClient();

  if (voted === true) {
    const { error } = await supabase.from("topic_votes").delete()
      .eq("topic_id", topicId).eq("profile_id", s.userId).eq("community_id", s.community.id);
    if (error) return { error: "Your vote could not be removed. Please try again." };
  } else {
    const { data: topic } = await supabase.from("meeting_topics").select("status")
      .eq("id", topicId).eq("community_id", s.community.id).maybeSingle();
    if (!topic) return { error: "This topic no longer exists." };
    if (topic.status !== "open") return { error: "Voting has closed for this topic." };
    const { error } = await supabase.from("topic_votes")
      .insert({ topic_id: topicId, community_id: s.community.id, profile_id: s.userId });
    if (error && error.code !== "23505") return { error: "Your vote could not be saved. Please try again." };
  }
  revalidatePath(`/${slug}/meetings`);
  return {};
}

export async function proposeTopic(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const title = text(form, "title").replace(/\s+/g, " ");
  const description = text(form, "description");

  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) fieldErrors.title = "Give the topic a title of at least 3 characters.";
  else if (title.length > 200) fieldErrors.title = "Keep the title under 200 characters.";
  if (description.length > 1000) fieldErrors.description = "Keep the details under 1,000 characters.";
  if (Object.keys(fieldErrors).length) return { error: "Please check the topic and try again.", fieldErrors };

  const { data: existing } = await supabase.from("meeting_topics").select("title")
    .eq("community_id", s.community.id).in("status", ["open", "on_agenda"]);
  if ((existing ?? []).some((t) => t.title.toLowerCase() === title.toLowerCase())) {
    return { error: "This topic is already on the list. You can vote for it instead.", fieldErrors: { title: "Already suggested." } };
  }

  const { data, error } = await supabase.from("meeting_topics")
    .insert({ community_id: s.community.id, title, description: description || null, proposed_by: s.userId })
    .select("id").single();
  if (error || !data) return { error: "Your topic could not be saved. Please try again." };

  // Proposers automatically support their own topic.
  await supabase.from("topic_votes").insert({ topic_id: data.id, community_id: s.community.id, profile_id: s.userId });
  revalidatePath(`/${slug}/meetings`);
  return { ok: true, okAt: Date.now(), message: "Thank you. Your topic is on the list, with your vote." };
}

export async function setTopicStatus(slug: string, topicId: string, form: FormData): Promise<ActionResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(topicId)) return { error: "This topic no longer exists." };
  const status = text(form, "status");
  if (!(TOPIC_STATUSES as readonly string[]).includes(status)) return { error: "Choose a status for the topic." };

  const supabase = await createClient();
  const { data: topic } = await supabase.from("meeting_topics").select("id, meeting_id")
    .eq("id", topicId).eq("community_id", s.community.id).maybeSingle();
  if (!topic) return { error: "This topic no longer exists." };

  let meetingId: string | null = topic.meeting_id;
  if (status === "open") meetingId = null;
  if (status === "on_agenda") {
    const m = await findMeeting(s.community.id, text(form, "meeting_id"));
    if (!m) return { error: "Choose the meeting where it will be discussed." };
    if (m.status === "cancelled") return { error: "That meeting has been cancelled. Choose another one." };
    meetingId = m.id;
  }

  const { error } = await supabase.from("meeting_topics").update({ status, meeting_id: meetingId })
    .eq("id", topicId).eq("community_id", s.community.id);
  if (error) return { error: "The topic could not be updated. Please try again." };
  refresh(slug, topic.meeting_id, meetingId);
  return {};
}

/* ------------------------------------------------------------------ RSVP */

export async function rsvp(slug: string, meetingId: string, response: string): Promise<ActionResult> {
  const s = await requireMember(slug);
  if (!RSVP_OPTIONS.some((o) => o.value === response)) return { error: "Please choose one of the options." };
  const m = await findMeeting(s.community.id, meetingId);
  if (!m) return { error: "This meeting no longer exists." };
  if (m.status === "cancelled") return { error: "This meeting has been cancelled." };
  if (m.status === "held" || hasEnded(m)) return { error: "This meeting has already taken place." };

  const supabase = await createClient();
  const { error } = await supabase.from("meeting_rsvps").upsert({
    meeting_id: m.id, profile_id: s.userId, community_id: s.community.id, response, updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Your reply could not be saved. Please try again." };
  refresh(slug, m.id);
  return {};
}

/* ------------------------------------------------------------------ meetings */

export async function saveMeeting(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const id = text(form, "id");

  const title = text(form, "title").replace(/\s+/g, " ");
  const meetingType = text(form, "meeting_type");
  const local = text(form, "starts_at"); // "2026-10-12T18:00" in the community's time zone
  const duration = Number(text(form, "duration_minutes"));
  const location = text(form, "location");
  const meetingUrl = text(form, "meeting_url");
  const agenda = lines(text(form, "agenda")).join("\n");
  const status = text(form, "status") || "scheduled";

  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) fieldErrors.title = "Give the meeting a title of at least 3 characters.";
  else if (title.length > 200) fieldErrors.title = "Keep the title under 200 characters.";
  if (!MEETING_TYPES.some((t) => t.value === meetingType)) fieldErrors.meeting_type = "Choose the type of meeting.";

  let startsAt: string | null = null;
  const year = Number(local.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || Number.isNaN(new Date(`${local}:00Z`).getTime())) {
    fieldErrors.starts_at = "Choose the date and start time.";
  } else if (year < 2000 || year > new Date().getUTCFullYear() + 5) {
    fieldErrors.starts_at = "Check the year of the meeting.";
  } else {
    startsAt = zonedToUtc(local, s.community.timezone);
  }
  if (!Number.isInteger(duration) || duration < 15 || duration > 600) fieldErrors.duration_minutes = "Choose how long the meeting lasts.";
  if (location.length > 200) fieldErrors.location = "Keep the place under 200 characters.";
  if (meetingUrl && (!isWebUrl(meetingUrl) || meetingUrl.length > 500)) {
    fieldErrors.meeting_url = "Enter the full link, starting with https://";
  }
  if (!location && !meetingUrl && !fieldErrors.location) fieldErrors.location = "Add where the meeting is, or a link to join online.";
  if (agenda.length > 4000) fieldErrors.agenda = "Keep the agenda under 4,000 characters.";
  if (!MEETING_STATUSES.some((x) => x.value === status)) fieldErrors.status = "Choose a status.";
  if (!id && startsAt && (status === "scheduled" || status === "postponed") && new Date(startsAt).getTime() < Date.now()) {
    fieldErrors.starts_at = "This time has already passed. Choose a future date, or set the status to Held.";
  }
  if (Object.keys(fieldErrors).length) {
    return { error: "Some details need a second look.", fieldErrors };
  }

  const record = {
    title,
    meeting_type: meetingType,
    starts_at: startsAt!,
    duration_minutes: duration,
    location: location || null,
    meeting_url: meetingUrl || null,
    agenda: agenda || null,
    status,
  };

  let savedId: string;
  if (id) {
    const existing = await findMeeting(s.community.id, id);
    if (!existing) return { error: "This meeting no longer exists." };
    const { error } = await supabase.from("meetings").update(record).eq("id", id).eq("community_id", s.community.id);
    if (error) return { error: "The meeting could not be saved. Please try again." };
    savedId = id;
  } else {
    const { data, error } = await supabase.from("meetings")
      .insert({ ...record, community_id: s.community.id, created_by: s.userId }).select("id").single();
    if (error || !data) return { error: "The meeting could not be saved. Please try again." };
    savedId = data.id;
  }
  refresh(slug, savedId);
  redirect(`/${slug}/meetings/${savedId}?${id ? "saved" : "created"}=1`);
}

export async function cancelMeeting(slug: string, meetingId: string): Promise<ActionResult> {
  const s = await requireAdmin(slug);
  const m = await findMeeting(s.community.id, meetingId);
  if (!m) return { error: "This meeting no longer exists." };
  if (m.status === "held") return { error: "This meeting has already taken place." };
  if (m.status !== "cancelled") {
    const supabase = await createClient();
    // The notify_meeting trigger tells every member about the cancellation.
    const { error } = await supabase.from("meetings").update({ status: "cancelled" })
      .eq("id", m.id).eq("community_id", s.community.id);
    if (error) return { error: "The meeting could not be cancelled. Please try again." };
  }
  refresh(slug, m.id);
  redirect(`/${slug}/meetings/${m.id}?cancelled=1`);
}

/* ------------------------------------------------------------------ minutes + action items */

export async function saveMinutes(slug: string, meetingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const m = await findMeeting(s.community.id, meetingId);
  if (!m) return { error: "This meeting no longer exists." };
  if (m.status === "cancelled") return { error: "This meeting was cancelled, so it has no minutes." };
  if (m.status !== "held" && !hasStarted(m)) return { error: "Minutes can be added once the meeting has started." };

  const summary = text(form, "summary");
  const decisions = lines(text(form, "decisions")).map((d) => d.replace(/^(\d+[.)]|[-–•*])\s*/, ""));
  const recordingUrl = text(form, "recording_url");
  const documentId = text(form, "document_id");

  const fieldErrors: Record<string, string> = {};
  if (summary.length > 5000) fieldErrors.summary = "Keep the summary under 5,000 characters.";
  if (decisions.length > 40) fieldErrors.decisions = "Add at most 40 decisions.";
  else if (decisions.some((d) => d.length > 300)) fieldErrors.decisions = "Keep each decision under 300 characters.";
  if (!summary && decisions.length === 0) fieldErrors.summary = "Add a short summary or at least one decision.";
  if (recordingUrl && (!isWebUrl(recordingUrl) || recordingUrl.length > 500)) {
    fieldErrors.recording_url = "Enter the full link, starting with https://";
  }

  const supabase = await createClient();
  if (documentId) {
    const { data: doc } = UUID_RE.test(documentId)
      ? await supabase.from("documents").select("id").eq("id", documentId).eq("community_id", s.community.id).maybeSingle()
      : { data: null };
    if (!doc) fieldErrors.document_id = "Choose a document from the list.";
  }
  if (Object.keys(fieldErrors).length) return { error: "Some details need a second look.", fieldErrors };

  const record = {
    summary: summary || null,
    decisions,
    recording_url: recordingUrl || null,
    document_id: documentId || null,
  };
  const { data: existing } = await supabase.from("meeting_minutes").select("id")
    .eq("meeting_id", m.id).eq("community_id", s.community.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = existing
    ? await supabase.from("meeting_minutes").update(record).eq("id", existing.id).eq("community_id", s.community.id)
    : await supabase.from("meeting_minutes").insert({ ...record, community_id: s.community.id, meeting_id: m.id });
  if (error) return { error: "The minutes could not be saved. Please try again." };

  if (form.get("mark_held") === "on" && m.status !== "held") {
    const { error: heldError } = await supabase.from("meetings").update({ status: "held" }).eq("id", m.id).eq("community_id", s.community.id);
    if (heldError) {
      refresh(slug, m.id);
      return { error: "The minutes were saved, but the meeting could not be marked as held. Try again with Edit meeting." };
    }
  }
  refresh(slug, m.id);
  redirect(`/${slug}/meetings/${m.id}?minutes=1`);
}

export async function addActionItem(slug: string, meetingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin(slug);
  const m = await findMeeting(s.community.id, meetingId);
  if (!m) return { error: "This meeting no longer exists." };

  const title = text(form, "title").replace(/\s+/g, " ");
  const owner = text(form, "owner_name");
  const due = text(form, "due_date");
  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) fieldErrors.title = "Describe the task in at least 3 characters.";
  else if (title.length > 200) fieldErrors.title = "Keep the task under 200 characters.";
  if (owner.length > 100) fieldErrors.owner_name = "Keep the name under 100 characters.";
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(new Date(`${due}T00:00:00Z`).getTime()))) {
    fieldErrors.due_date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length) return { error: "Some details need a second look.", fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("action_items").insert({
    community_id: s.community.id, meeting_id: m.id, title, owner_name: owner || null, due_date: due || null,
  });
  if (error) return { error: "The action could not be saved. Please try again." };
  refresh(slug, m.id);
  return { ok: true, okAt: Date.now(), message: "Action added." };
}

export async function setActionItemStatus(slug: string, itemId: string, done: boolean): Promise<void> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(itemId)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("action_items").update({ status: done ? "done" : "open" })
    .eq("id", itemId).eq("community_id", s.community.id).select("meeting_id").maybeSingle();
  refresh(slug, data?.meeting_id);
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone to a UTC ISO string. */
function zonedToUtc(local: string, timeZone: string) {
  const asUtc = new Date(`${local}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(asUtc).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
}
