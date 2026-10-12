import Link from "next/link";
import { CalendarDays, ChevronDown, Clock, History, Lightbulb, MapPin, Plus, Video } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, Empty, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import { DateTile } from "@/components/meetings/DateTile";
import { VoteButton } from "@/components/meetings/VoteButton";
import { TopicForm } from "@/components/meetings/TopicForm";
import { TopicStatusControl, type AgendaMeeting } from "@/components/meetings/TopicStatusControl";
import { ago, hasEnded, hasStarted, inZone, typeLabel, typeTone } from "@/components/meetings/meeting-utils";
import { proposeTopic, setTopicStatus, toggleVote } from "./actions";

export const metadata = { title: "Meetings" };

type MeetingRow = {
  id: string; title: string; meeting_type: string; starts_at: string; duration_minutes: number;
  location: string | null; meeting_url: string | null; status: string; minutes: { id: string }[];
};

type TopicRow = {
  id: string; title: string; description: string | null; status: string; meeting_id: string | null;
  meeting_title: string | null; meeting_starts_at: string | null; proposed_by_name: string | null;
  created_at: string; votes: number; voted_by_me: boolean;
};

const MY_RSVP: Record<string, { label: string; tone: "ok" | "info" | "neutral" }> = {
  attending: { label: "You're attending", tone: "ok" },
  online: { label: "You're joining online", tone: "info" },
  not_attending: { label: "You're not attending", tone: "neutral" },
};

export default async function MeetingsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const tz = s.community.timezone;
  const c = s.community.id;

  const [{ data: meetingData }, { data: myRsvps }, { data: topicData }] = await Promise.all([
    supabase.from("meetings")
      .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, status, minutes:meeting_minutes(id)")
      .eq("community_id", c).order("starts_at"),
    supabase.from("meeting_rsvps").select("meeting_id, response").eq("community_id", c).eq("profile_id", s.userId),
    supabase.from("v_meeting_topics")
      .select("id, title, description, status, meeting_id, meeting_title, meeting_starts_at, proposed_by_name, created_at, votes, voted_by_me")
      .eq("community_id", c),
  ]);

  const meetings = (meetingData ?? []) as MeetingRow[];
  const now = Date.now();
  const upcoming = meetings.filter((m) => m.status !== "held" && !hasEnded(m, now));
  const past = meetings.filter((m) => !upcoming.includes(m)).reverse();
  const rsvpBy = new Map((myRsvps ?? []).map((r) => [r.meeting_id as string, r.response as string]));

  const topics = (topicData ?? []) as TopicRow[];
  const byVotes = (a: TopicRow, b: TopicRow) => b.votes - a.votes || b.created_at.localeCompare(a.created_at);
  const active = topics.filter((t) => t.status === "open" || t.status === "on_agenda").sort(byVotes);
  const closed = topics.filter((t) => t.status === "discussed" || t.status === "declined")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Meetings a topic can be put on: upcoming and not cancelled.
  const agendaMeetings: AgendaMeeting[] = upcoming.filter((m) => m.status !== "cancelled").map((m) => ({
    id: m.id, label: `${m.title} (${inZone(m.starts_at, tz, { day: "numeric", month: "short" })})`,
  }));
  const optionsFor = (t: TopicRow): AgendaMeeting[] =>
    t.meeting_id && t.meeting_title && !agendaMeetings.some((m) => m.id === t.meeting_id)
      ? [{ id: t.meeting_id, label: t.meeting_title }, ...agendaMeetings]
      : agendaMeetings;

  return (
    <>
      <PageHeader
        title="Meetings"
        intro="Dates, agendas and minutes. Tell us if you are coming and vote on what to discuss."
        actions={s.isAdmin ? <Button href={`${base}/meetings/new`}><Plus aria-hidden className="size-4" /> New meeting</Button> : undefined}
      />

      <div className="flex flex-col gap-8">
        {/* Upcoming */}
        <section aria-labelledby="upcoming">
          <h2 id="upcoming" className="mb-3 text-[1.0625rem] font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <Empty icon={CalendarDays} title="No meetings planned"
              action={s.isAdmin ? <Button href={`${base}/meetings/new`} variant="secondary"><Plus aria-hidden className="size-4" /> New meeting</Button> : undefined}>
              {s.isAdmin ? "Create a meeting and every member gets a notice." : "The next meeting will appear here, and you will get a notice."}
            </Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {upcoming.map((m) => {
                const off = m.status === "cancelled";
                const mine = rsvpBy.get(m.id);
                return (
                  <li key={m.id}>
                    <Card className="relative flex h-full gap-4 transition-colors hover:border-brand-line">
                      <DateTile date={m.starts_at} timeZone={tz} muted={off} />
                      <div className="flex min-w-0 flex-1 flex-col break-words">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={typeTone(m.meeting_type)} dot={false}>{typeLabel(m.meeting_type)}</Badge>
                          {m.status !== "scheduled" && <StatusBadge value={m.status} />}
                          {!off && hasStarted(m, now) && <Badge tone="ok">Happening now</Badge>}
                        </div>
                        <h3 className="mt-2 text-[1.0625rem] font-medium leading-snug">
                          <Link href={`${base}/meetings/${m.id}`}
                            className={`text-ink no-underline after:absolute after:inset-0 after:rounded-card after:content-[''] hover:underline ${off ? "line-through decoration-muted" : ""}`}>
                            {m.title}
                          </Link>
                        </h3>
                        <ul className="mt-1.5 flex flex-col gap-1 text-[0.9375rem] text-muted">
                          <li className="flex items-start gap-2">
                            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
                            {inZone(m.starts_at, tz, { weekday: "long" })} at {inZone(m.starts_at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                          </li>
                          <li className="flex min-w-0 items-start gap-2">
                            {m.location ? <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Video aria-hidden className="mt-0.5 size-4 shrink-0" />}
                            <span className="min-w-0 break-words">{m.location ?? "Online"}{m.location && m.meeting_url ? " · or online" : ""}</span>
                          </li>
                        </ul>
                        {!off && (
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                            {mine ? <Badge tone={MY_RSVP[mine]?.tone ?? "neutral"}>{MY_RSVP[mine]?.label}</Badge>
                              : <span className="text-sm text-muted">Not replied yet</span>}
                            {m.meeting_url && m.status === "scheduled" && (
                              <Button href={m.meeting_url} external size="sm" variant="soft" className="relative z-10">
                                <Video aria-hidden className="size-4" /> Join
                                <span className="sr-only"> {m.title} (opens in a new tab)</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          {/* Suggested topics */}
          <Card className="lg:col-span-3" padded={false}>
            <span id="topics" aria-hidden className="block scroll-mt-24" />
            <div className="p-5 pb-4 sm:p-6 sm:pb-4">
              <SectionHeader icon={Lightbulb} title="Suggested topics" description="Vote for what should be discussed at the next meeting." className="mb-4" />
              <TopicForm action={proposeTopic.bind(null, s.community.slug)} />
            </div>
            {active.length === 0 ? (
              <p className="border-t border-line px-5 py-6 text-[0.9375rem] text-muted sm:px-6">No open topics yet. Suggest the first one.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {active.map((t) => (
                  <li key={t.id} className="flex gap-4 px-5 py-4 sm:px-6">
                    <VoteButton title={t.title} votes={t.votes} voted={t.voted_by_me} canVote={t.status === "open"}
                      action={toggleVote.bind(null, s.community.slug, t.id)} />
                    <div className="min-w-0 flex-1 break-words">
                      <div className="font-medium leading-snug text-ink">{t.title}</div>
                      {t.description && <p className="mt-0.5 text-[0.9375rem] text-ink-2">{t.description}</p>}
                      <div className="mt-1 text-sm text-muted">
                        {t.proposed_by_name ? `${t.proposed_by_name} · ` : ""}{ago(t.created_at, now)}
                      </div>
                      {t.status === "on_agenda" && t.meeting_id && (
                        <Link href={`${base}/meetings/${t.meeting_id}`} className="mt-2 inline-flex max-w-full no-underline">
                          <Badge tone="ok" className="max-w-full"><span className="truncate">On the agenda: {t.meeting_title}</span></Badge>
                        </Link>
                      )}
                      {s.isAdmin && (
                        <div className="mt-2.5">
                          <TopicStatusControl topicId={t.id} title={t.title} status={t.status} meetingId={t.meeting_id}
                            meetings={optionsFor(t)} action={setTopicStatus.bind(null, s.community.slug, t.id)} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {closed.length > 0 && (
              <details className="group border-t border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
                  Discussed and declined ({closed.length})
                  <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {closed.map((t) => (
                    <li key={t.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words text-[0.9375rem] text-ink">{t.title}</span>
                        <StatusBadge value={t.status} />
                      </div>
                      {t.meeting_id && t.meeting_title && (
                        <Link href={`${base}/meetings/${t.meeting_id}`} className="w-fit text-sm text-muted">{t.meeting_title}</Link>
                      )}
                      {s.isAdmin && (
                        <TopicStatusControl topicId={t.id} title={t.title} status={t.status} meetingId={t.meeting_id}
                          meetings={optionsFor(t)} action={setTopicStatus.bind(null, s.community.slug, t.id)} />
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {/* Past meetings */}
          <Card className="lg:col-span-2" padded={false}>
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={History} title="Past meetings" />
            </div>
            {past.length === 0 ? (
              <p className="px-5 pb-6 text-[0.9375rem] text-muted sm:px-6">Minutes of past meetings will appear here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {past.map((m) => (
                  <li key={m.id} className="relative flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                    <DateTile date={m.starts_at} timeZone={tz} size="sm" muted className="self-center" />
                    <div className="min-w-0 flex-1 break-words">
                      <Link href={`${base}/meetings/${m.id}`}
                        className="block font-medium leading-snug text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline">
                        {m.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                        <span>{typeLabel(m.meeting_type)} · {inZone(m.starts_at, tz, { year: "numeric" })}</span>
                        {m.minutes.length > 0 && <Badge tone="brand" dot={false}>Minutes</Badge>}
                        {m.status === "cancelled" && <StatusBadge value="cancelled" />}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
