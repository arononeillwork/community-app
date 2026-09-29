import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, CalendarPlus, CircleCheck, Clock, MapPin, Plus, ThumbsUp, Trash2, Users, Video } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime } from "@/lib/format";
import { Badge, Button, Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import ConfirmForm from "@/components/meetings/ConfirmForm";
import SubmitButton from "@/components/meetings/SubmitButton";
import TopicAdminControls from "@/components/meetings/TopicAdminControls";
import TopicForm from "@/components/meetings/TopicForm";
import {
  RSVP_OPTIONS, TOPIC_TABS, buttonClass, dayKey, durationLabel, endMs, isUpcoming, meetingType, providerName,
  relativeDay, safeHttpUrl, timeOnly, type TopicStatus,
} from "@/components/meetings/meeting-utils";
import { deleteTopic, toggleVote } from "./actions";

export const metadata = { title: "Meetings" };

type MeetingRow = {
  id: string;
  title: string;
  meeting_type: string;
  starts_at: string;
  duration_minutes: number | null;
  location: string | null;
  meeting_url: string | null;
  status: string;
};

type TopicRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  meeting_id: string | null;
  meeting_title: string | null;
  meeting_starts_at: string | null;
  proposed_by: string | null;
  proposed_by_name: string | null;
  admin_note: string | null;
  created_at: string;
  votes: number | null;
  voted_by_me: boolean | null;
};

const supporters = (n: number) => (n === 1 ? "supporter" : "supporters");

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export default async function MeetingsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const slug = s.community.slug;
  const base = `/${slug}`;
  const tz = s.community.timezone;
  const cid = s.community.id;

  const [{ data: meetingData }, { data: topicData }, { data: minutesData }, { data: rsvpData }] = await Promise.all([
    supabase.from("meetings")
      .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, status")
      .eq("community_id", cid).order("starts_at"),
    supabase.from("v_meeting_topics")
      .select("id, title, description, status, meeting_id, meeting_title, meeting_starts_at, proposed_by, proposed_by_name, admin_note, created_at, votes, voted_by_me")
      .eq("community_id", cid),
    supabase.from("meeting_minutes").select("meeting_id, summary, created_at")
      .eq("community_id", cid).order("created_at", { ascending: false }),
    supabase.from("meeting_rsvps").select("meeting_id, response")
      .eq("community_id", cid).eq("profile_id", s.userId),
  ]);

  const meetings = (meetingData ?? []) as MeetingRow[];
  const now = Date.now();
  const upcoming = meetings.filter((m) => isUpcoming(m, now));
  const past = meetings.filter((m) => !isUpcoming(m, now)).reverse();

  const myRsvp = new Map<string, string>((rsvpData ?? []).map((r) => [String(r.meeting_id), String(r.response)]));
  const summaryByMeeting = new Map<string, string>();
  for (const mm of minutesData ?? []) {
    if (!summaryByMeeting.has(mm.meeting_id) && mm.summary) summaryByMeeting.set(mm.meeting_id, mm.summary);
  }

  // Topics: residents cannot read other people's profiles, so the view's proposer name can be empty.
  // The community directory (names of active members) fills the gap.
  const topics = (topicData ?? []) as TopicRow[];
  const names = new Map<string, string>();
  if (topics.some((t) => t.proposed_by && !t.proposed_by_name && t.proposed_by !== s.userId)) {
    const { data: dir } = await supabase.rpc("directory", { c: cid });
    for (const d of (dir ?? []) as { profile_id: string; full_name: string | null }[]) {
      if (d.full_name) names.set(d.profile_id, d.full_name);
    }
  }
  const proposerName = (t: TopicRow) =>
    t.proposed_by === s.userId ? "you" : t.proposed_by_name || (t.proposed_by && names.get(t.proposed_by)) || "a resident";

  const tabParam = typeof sp.topics === "string" ? sp.topics : "";
  const tab: TopicStatus = TOPIC_TABS.find((t) => t.value === tabParam)?.value ?? "open";
  const counts = Object.fromEntries(TOPIC_TABS.map((t) => [t.value, topics.filter((x) => x.status === t.value).length]));
  const shownTopics = topics
    .filter((t) => t.status === tab)
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || b.created_at.localeCompare(a.created_at));

  function tabHref(value: TopicStatus) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "topics" || v == null) continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
    }
    if (value !== "open") q.set("topics", value);
    const qs = q.toString();
    return `${base}/meetings${qs ? `?${qs}` : ""}#topics`;
  }

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: tz });
  const agendaChoices = upcoming
    .filter((m) => m.status !== "cancelled")
    .map((m) => ({ id: m.id, label: `${m.title} (${shortDate(m.starts_at)})` }));

  const pastRows = past.map((m) => ({
    id: m.id,
    title: m.title,
    type: meetingType(m.meeting_type).short,
    date: dayKey(m.starts_at, tz),
    status: m.status,
    summary: summaryByMeeting.has(m.id)
      ? truncate(summaryByMeeting.get(m.id)!, 220)
      : m.status === "held" ? "Minutes not added yet" : "",
  }));
  const pastColumns: Column[] = [
    { key: "title", header: "Meeting", href: `${base}/meetings/{id}`, primary: true },
    { key: "date", header: "Date", type: "date" },
    { key: "type", header: "Type", filter: true },
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "summary", header: "Summary of the minutes" },
  ];

  return (
    <>
      <PageHeader
        title="Meetings"
        intro={<>Meetings take place in person or online (for example on Zoom or Teams). This page tells you when and where, and lets you suggest topics. All times are local time ({tz}).</>}
        actions={s.isAdmin ? (
          <Button href={`${base}/meetings/new`} size="lg"><Plus aria-hidden className="size-6" /> Plan a meeting</Button>
        ) : undefined}
      />

      <div className="flex flex-col gap-12">
        {/* ------------------------------------------------------------------ Upcoming */}
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="mb-4 text-2xl font-bold">Upcoming meetings</h2>
          {upcoming.length === 0 ? (
            <Empty title="No meetings are planned right now.">
              {s.isAdmin ? "Use “Plan a meeting” to announce one. Every resident will get a message." : "You will get a message as soon as a meeting is planned."}
            </Empty>
          ) : (
            <ul className="grid gap-5 lg:grid-cols-2">
              {upcoming.map((m) => {
                const type = meetingType(m.meeting_type);
                const url = safeHttpUrl(m.meeting_url);
                const provider = providerName(url);
                const active = m.status === "scheduled";
                const rel = active ? relativeDay(m.starts_at, tz) : null;
                const mine = myRsvp.get(m.id);
                return (
                  <li key={m.id}>
                    <Card as="article" className={clsx("flex h-full flex-col gap-4", !active && "border-2 border-dashed")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={type.tone}>{type.short}</Badge>
                        {m.status !== "scheduled" && <StatusBadge value={m.status} />}
                        {rel && <Badge tone="ok">{rel}</Badge>}
                      </div>
                      <h3 className="text-2xl font-bold leading-tight">
                        <Link href={`${base}/meetings/${m.id}`} className="text-ink underline-offset-4 hover:underline">{m.title}</Link>
                      </h3>
                      <ul className="flex flex-col gap-2 text-lg">
                        <li className="flex items-start gap-3">
                          <CalendarDays aria-hidden className="mt-1 size-6 shrink-0 text-brand" />
                          <span>
                            <span className={clsx("block font-bold", m.status === "cancelled" && "line-through")}>{dateTime(m.starts_at, tz)}</span>
                            <span className="block text-muted">Until {timeOnly(endMs(m.starts_at, m.duration_minutes), tz)} ({durationLabel(m.duration_minutes)})</span>
                          </span>
                        </li>
                        {m.location && (
                          <li className="flex items-start gap-3"><MapPin aria-hidden className="mt-1 size-6 shrink-0 text-brand" /> {m.location}</li>
                        )}
                        {url && (
                          <li className="flex items-start gap-3"><Video aria-hidden className="mt-1 size-6 shrink-0 text-brand" /> Online meeting{provider ? ` (${provider})` : ""}</li>
                        )}
                        {!m.location && !url && (
                          <li className="flex items-start gap-3"><MapPin aria-hidden className="mt-1 size-6 shrink-0 text-brand" /> Place to be confirmed</li>
                        )}
                      </ul>
                      {m.status === "cancelled" && <p className="font-bold text-bad">This meeting has been cancelled.</p>}
                      {m.status === "postponed" && <p className="font-bold text-warn">This meeting has been postponed. A new date will be announced.</p>}
                      {active && mine && (
                        <p className="flex items-center gap-2 font-bold text-ok">
                          <CircleCheck aria-hidden className="size-5" /> {RSVP_OPTIONS.find((o) => o.value === mine)?.mine}
                        </p>
                      )}
                      <div className="no-print mt-auto flex flex-wrap gap-2 pt-2">
                        {active && url && (
                          <Button href={url} external size="lg">
                            <Video aria-hidden className="size-6" /> Join meeting<span className="sr-only"> {m.title} (opens in a new window)</span>
                          </Button>
                        )}
                        {active && (
                          <a href={`${base}/meetings/${m.id}/calendar.ics`} download className={buttonClass("secondary", "lg")}>
                            <CalendarPlus aria-hidden className="size-6" /> Add to calendar<span className="sr-only">: {m.title}</span>
                          </a>
                        )}
                        <Button href={`${base}/meetings/${m.id}`} variant="secondary" size="lg">
                          Details<span className="sr-only">: {m.title}</span>
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------------------ Topics */}
        <section id="topics" aria-labelledby="topics-heading" className="scroll-mt-32">
          <h2 id="topics-heading" className="text-2xl font-bold">Suggested topics for future meetings</h2>
          <p className="mb-4 mt-1 max-w-3xl text-muted">
            Is there something you would like the community to talk about? Suggest it here. Press “Support this topic” on the ideas you agree with:
            the topics with the most support are shown first, and the committee uses this list to plan the agenda (the list of subjects) of future meetings.
          </p>

          <Card className="mb-6">
            <h3 className="mb-3 text-xl font-bold">Suggest a topic</h3>
            <TopicForm slug={slug} />
          </Card>

          <nav aria-label="Show topics" className="no-print mb-4 flex flex-wrap gap-2">
            {TOPIC_TABS.map((t) => {
              const on = t.value === tab;
              return (
                <Link key={t.value} href={tabHref(t.value)} scroll={false} aria-current={on ? "true" : undefined}
                  className={clsx("inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-5 font-bold no-underline",
                    on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand")}>
                  {t.label} <span className="tabular">({counts[t.value] ?? 0})</span>
                </Link>
              );
            })}
          </nav>

          {shownTopics.length === 0 ? (
            <Empty title={TOPIC_TABS.find((t) => t.value === tab)?.empty ?? "No topics."} />
          ) : (
            <ol className="flex flex-col gap-4" aria-label={`${TOPIC_TABS.find((t) => t.value === tab)?.label} topics, most supported first`}>
              {shownTopics.map((t) => {
                const votes = t.votes ?? 0;
                const voted = !!t.voted_by_me;
                const mine = t.proposed_by === s.userId;
                const canDelete = (mine && t.status === "open") || s.isAdmin;
                return (
                  <li key={t.id}>
                    <Card as="article" className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="no-print shrink-0 sm:w-56">
                        {t.status === "open" ? (
                          <>
                            <form action={toggleVote.bind(null, slug, t.id)}>
                              <SubmitButton pressed={voted} pendingLabel="Saving…"
                                className={clsx("flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 py-2 text-left font-bold transition-colors",
                                  voted ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:border-brand")}>
                                {voted ? <CircleCheck aria-hidden className="size-8 shrink-0" /> : <ThumbsUp aria-hidden className="size-8 shrink-0" />}
                                <span className="flex flex-col">
                                  <span className="tabular text-2xl leading-tight">
                                    {votes}<span className="sr-only"> {votes === 1 ? "person supports" : "people support"} this topic.</span>
                                  </span>
                                  <span className="text-base">{voted ? "You support this" : "Support this topic"}</span>
                                </span>
                              </SubmitButton>
                            </form>
                            {voted && <p className="hint mt-1">Press again to take back your support.</p>}
                          </>
                        ) : (
                          <div className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-line bg-bg px-4 py-2 font-bold">
                            <Users aria-hidden className="size-8 shrink-0" />
                            <span className="flex flex-col">
                              <span className="tabular text-2xl leading-tight">{votes}</span>
                              <span className="text-base">{supporters(votes)}{voted ? " (including you)" : ""}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={t.status} />
                          <span className="print:inline hidden font-bold">{votes} {supporters(votes)}</span>
                        </div>
                        <h3 className="text-xl font-bold">{t.title}</h3>
                        {t.description && <p className="whitespace-pre-line">{t.description}</p>}
                        <p className="text-muted">Suggested by {proposerName(t)} on {date(t.created_at)}</p>
                        {t.meeting_id && t.meeting_title && (t.status === "on_agenda" || t.status === "discussed") && (
                          <p className="flex flex-wrap items-center gap-x-2">
                            <Clock aria-hidden className="size-5 text-brand" />
                            {t.status === "on_agenda" ? "On the agenda of" : "Discussed at"}
                            <Link href={`${base}/meetings/${t.meeting_id}`} className="font-bold text-brand underline underline-offset-4">
                              {t.meeting_title}
                            </Link>
                            {t.meeting_starts_at && <span className="text-muted">({shortDate(t.meeting_starts_at)})</span>}
                          </p>
                        )}
                        {t.admin_note && (
                          <p className="rounded-xl border border-line bg-bg p-3"><strong>Note from the administrator:</strong> {t.admin_note}</p>
                        )}
                        {canDelete && (
                          <div className="no-print">
                            <ConfirmForm
                              action={deleteTopic.bind(null, slug, t.id)}
                              trigger={<><Trash2 aria-hidden className="size-5" /> {mine ? "Delete my topic" : "Delete topic"}</>}
                              question={<>Delete “{t.title}”? The support it has received will be lost. This cannot be undone.</>}
                              confirmLabel="Yes, delete the topic"
                              cancelLabel="No, keep it"
                              className="w-fit"
                            />
                          </div>
                        )}
                        {s.isAdmin && (
                          <details className="no-print mt-1 rounded-xl border-2 border-line">
                            <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-bold">Manage this topic (administrators)</summary>
                            <div className="border-t border-line p-4">
                              <TopicAdminControls slug={slug} topicId={t.id} status={t.status} meetingId={t.meeting_id}
                                meetings={agendaChoices} adminNote={t.admin_note} />
                            </div>
                          </details>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ------------------------------------------------------------------ Past */}
        <section aria-labelledby="past-heading">
          <h2 id="past-heading" className="mb-4 text-2xl font-bold">Past meetings</h2>
          <DataTable
            id="past_"
            rows={pastRows}
            columns={pastColumns}
            dateKey="date"
            defaultSort={{ key: "date", desc: true }}
            exportName="past-meetings"
            searchPlaceholder="Search past meetings…"
            empty="No past meetings yet."
          />
        </section>
      </div>
    </>
  );
}
