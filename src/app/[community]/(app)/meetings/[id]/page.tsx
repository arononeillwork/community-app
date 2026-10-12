import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck, CalendarPlus, Check, CheckCircle2, ChevronDown, Clock, FileText, Lightbulb, ListChecks, ListOrdered,
  MapPin, Pencil, PlayCircle, RotateCcw, Users, Video,
} from "lucide-react";
import { getCommunity, requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, todayInput } from "@/lib/format";
import { Badge, Button, Card, IconButton, Notice, PageHeader, SectionHeader, StatusBadge, buttonClass } from "@/components/ui";
import { DateTile } from "@/components/meetings/DateTile";
import { RsvpButtons } from "@/components/meetings/RsvpButtons";
import { CancelMeeting } from "@/components/meetings/CancelMeeting";
import { MinutesForm } from "@/components/meetings/MinutesForm";
import { ActionItemForm } from "@/components/meetings/ActionItemForm";
import {
  RSVP_OPTIONS, UUID_RE, agendaItems, durationLabel, hasEnded, hasStarted, longDate, providerName, timeRange, typeLabel,
  typeTone, zoneLabel, type RsvpResponse,
} from "@/components/meetings/meeting-utils";
import { addActionItem, cancelMeeting, rsvp, saveMinutes, setActionItemStatus } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const c = await getCommunity(community);
  if (!c || !UUID_RE.test(id)) return { title: "Meeting" };
  const supabase = await createClient();
  const { data } = await supabase.from("meetings").select("title").eq("id", id).eq("community_id", c.id).maybeSingle();
  return { title: data?.title ?? "Meeting" };
}

type Rsvp = { profile_id: string; response: RsvpResponse; profile?: { full_name: string | null } | null };
type Minutes = { id: string; summary: string | null; decisions: string[]; recording_url: string | null; document_id: string | null };
type ActionItem = { id: string; title: string; owner_name: string | null; due_date: string | null; status: string };
type Topic = { id: string; title: string; status: string; votes: number; proposed_by_name: string | null };

export default async function MeetingPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; cancelled?: string; minutes?: string }>;
}) {
  const { community, id } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const tz = s.community.timezone;
  const slug = s.community.slug;
  const base = `/${slug}`;

  const { data: m } = await supabase.from("meetings")
    .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, agenda_document_id, status")
    .eq("id", id).eq("community_id", c).maybeSingle();
  if (!m) notFound();

  const [{ data: rsvpData }, { data: minutesData }, { data: itemData }, { data: topicData }, members, docs] = await Promise.all([
    supabase.from("meeting_rsvps").select(s.isAdmin ? "profile_id, response, profile:profiles(full_name)" : "profile_id, response")
      .eq("meeting_id", id).eq("community_id", c),
    supabase.from("meeting_minutes").select("id, summary, decisions, recording_url, document_id")
      .eq("meeting_id", id).eq("community_id", c).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("action_items").select("id, title, owner_name, due_date, status")
      .eq("meeting_id", id).eq("community_id", c).order("due_date", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("v_meeting_topics").select("id, title, status, votes, proposed_by_name")
      .eq("meeting_id", id).eq("community_id", c).order("votes", { ascending: false }),
    s.isAdmin
      ? supabase.from("memberships").select("profile_id, profile:profiles(full_name)").eq("community_id", c).eq("status", "active").then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase.from("documents").select("id, title, folder").eq("community_id", c).order("folder").order("title").then((r) => r.data ?? []),
  ]);

  const rsvps = (rsvpData ?? []) as unknown as Rsvp[];
  const minutes = minutesData as Minutes | null;
  const items = (itemData ?? []) as ActionItem[];
  const topics = (topicData ?? []) as Topic[];

  const cancelled = m.status === "cancelled";
  const ended = hasEnded(m);
  const started = hasStarted(m);
  const canRsvp = (m.status === "scheduled" || m.status === "postponed") && !ended;
  const after = m.status === "held" || !!minutes;
  // Residents see the minutes box once there are minutes, or after a formal meeting (where minutes are expected).
  const showMinutes = s.isAdmin ? after || (started && !cancelled) : !!minutes || (after && m.meeting_type !== "informal");
  const agenda = agendaItems(m.agenda);
  const docList = docs as { id: string; title: string; folder: string | null }[];
  const docTitle = new Map(docList.map((d) => [d.id, d.title]));

  const mine = rsvps.find((r) => r.profile_id === s.userId)?.response ?? null;
  const counts = { attending: 0, online: 0, not_attending: 0 } as Record<RsvpResponse, number>;
  for (const r of rsvps) counts[r.response] += 1;

  // Admin view of who replied and who has not.
  const nameOf = new Map<string, string>();
  for (const mm of members as unknown as { profile_id: string; profile: { full_name: string | null } | null }[]) {
    nameOf.set(mm.profile_id, mm.profile?.full_name ?? "Member");
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  const groups = RSVP_OPTIONS.map((o) => ({
    ...o,
    names: rsvps.filter((r) => r.response === o.value).map((r) => r.profile?.full_name ?? nameOf.get(r.profile_id) ?? "Member").sort(byName),
  }));
  const replied = new Set(rsvps.map((r) => r.profile_id));
  const notReplied = [...nameOf.entries()].filter(([pid]) => !replied.has(pid)).map(([, n]) => n).sort(byName);

  const today = todayInput(tz);
  // A postponed meeting keeps its old date until a new one is set, so it offers neither Join nor a calendar entry.
  const goingAhead = m.status === "scheduled" && !ended;
  const showJoin = !!m.meeting_url && goingAhead;

  // Before the meeting the side column holds the RSVP; afterwards it holds the actions and topics.
  const showRsvp = canRsvp || rsvps.length > 0;

  // Residents do not need an empty agenda box once the meeting is over.
  const agendaCard = (agenda.length > 0 || !!m.agenda_document_id || s.isAdmin || !ended) && (
    <Card>
      <SectionHeader icon={ListOrdered} title="Agenda" />
      {agenda.length ? (
        <ol className="flex flex-col gap-3">
          {agenda.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-medium tabular text-muted ring-1 ring-line">{i + 1}</span>
              <span className="min-w-0 break-words pt-0.5 text-ink">{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[0.9375rem] text-muted">{s.isAdmin ? "No agenda yet. Add one with Edit meeting." : "The agenda will be posted here."}</p>
      )}
      {m.agenda_document_id && docTitle.has(m.agenda_document_id) && (
        <Link href={`${base}/documents/${m.agenda_document_id}`} className="mt-4 inline-flex items-center gap-2 text-[0.9375rem] font-medium">
          <FileText aria-hidden className="size-4" /> {docTitle.get(m.agenda_document_id)}
        </Link>
      )}
    </Card>
  );

  const minutesCard = showMinutes && (
    <Card>
      <SectionHeader icon={FileText} title="Minutes" />
      {minutes ? (
        <div className="flex flex-col gap-5">
          {minutes.summary && <p className="whitespace-pre-line break-words text-ink">{minutes.summary}</p>}
          {minutes.decisions.length > 0 && (
            <div>
              <h3 className="mb-2 text-[0.9375rem] font-medium text-muted">Decisions</h3>
              <ul className="flex flex-col gap-2">
                {minutes.decisions.map((d, i) => (
                  <li key={i} className="flex gap-2.5 text-ink">
                    <CheckCircle2 aria-hidden className="mt-0.5 size-[1.15rem] shrink-0 text-ok" /><span className="min-w-0 break-words">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(minutes.recording_url || (minutes.document_id && docTitle.has(minutes.document_id))) && (
            <div className="flex flex-wrap gap-2">
              {minutes.recording_url && (
                <Button href={minutes.recording_url} external variant="soft" size="sm">
                  <PlayCircle aria-hidden className="size-4" /> Watch the recording<span className="sr-only"> (opens in a new tab)</span>
                </Button>
              )}
              {minutes.document_id && docTitle.has(minutes.document_id) && (
                <Button href={`${base}/documents/${minutes.document_id}`} variant="soft" size="sm">
                  <FileText aria-hidden className="size-4" /> Read the full minutes
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[0.9375rem] text-muted">{s.isAdmin ? "No minutes yet. Add a short summary and the decisions." : "No minutes yet."}</p>
      )}
      {s.isAdmin && !cancelled && (
        <div className={minutes ? "mt-5 border-t border-line pt-4" : "mt-4"}>
          <MinutesForm
            action={saveMinutes.bind(null, slug, m.id)}
            editing={!!minutes}
            showMarkHeld={m.status !== "held"}
            documents={docList.map((d) => ({ id: d.id, label: d.folder ? `${d.folder} · ${d.title}` : d.title }))}
            initial={{
              summary: minutes?.summary ?? "",
              decisions: (minutes?.decisions ?? []).join("\n"),
              recording_url: minutes?.recording_url ?? "",
              document_id: minutes?.document_id ?? "",
            }}
          />
        </div>
      )}
    </Card>
  );

  const actionsCard = (items.length > 0 || (s.isAdmin && showMinutes)) && (
    <Card padded={false}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={ListChecks} title="Actions agreed"
          description={items.length ? `${items.filter((x) => x.status === "done").length} of ${items.length} done` : "Follow-up tasks from this meeting."} />
      </div>
      {items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((a) => {
            const done = a.status === "done";
            const overdue = !done && !!a.due_date && a.due_date < today;
            const meta = [a.owner_name, a.due_date ? `Due ${date(a.due_date)}` : null].filter(Boolean).join(" · ");
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1 break-words">
                  <div className={done ? "text-ink-2" : "text-ink"}>{a.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    <StatusBadge value={overdue ? "overdue" : a.status} />
                    {meta && <span>{meta}</span>}
                  </div>
                </div>
                {s.isAdmin && (
                  <form action={setActionItemStatus.bind(null, slug, a.id, !done)}>
                    <IconButton type="submit" icon={done ? RotateCcw : Check} label={done ? `Reopen “${a.title}”` : `Mark “${a.title}” as done`} variant="secondary" />
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {s.isAdmin && (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <ActionItemForm action={addActionItem.bind(null, slug, m.id)} />
        </div>
      )}
    </Card>
  );

  const topicsCard = topics.length > 0 && (
    <Card padded={false}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={Lightbulb} title="Topics"
          action={<Button href={`${base}/meetings#topics`} variant="ghost" size="sm">All topics</Button>} />
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {topics.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
            <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-surface-2 px-2 text-sm font-semibold tabular text-ink-2"
              title={`${t.votes} ${t.votes === 1 ? "vote" : "votes"}`}>
              {t.votes}<span className="sr-only"> {t.votes === 1 ? "vote" : "votes"}</span>
            </span>
            <div className="min-w-0 flex-1 break-words">
              <div className="text-ink">{t.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <StatusBadge value={t.status} />
                {t.proposed_by_name && <span>Suggested by {t.proposed_by_name}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );

  const rsvpCard = (
    <Card>
      <SectionHeader icon={CalendarCheck} title={canRsvp ? "Will you be there?" : "Replies"}
        description={cancelled ? "This meeting was cancelled." : !canRsvp ? "Replies are closed." : "Let the committee know."} />
      <RsvpButtons current={mine} counts={counts} open={canRsvp} hasLink={!!m.meeting_url}
        action={rsvp.bind(null, slug, m.id)} />
    </Card>
  );

  const responsesCard = s.isAdmin && (
    <Card padded={false}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={Users} title="Responses" description={`${replied.size} replied · ${notReplied.length} not yet`} />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {[
          ...groups.filter((g) => g.value !== "online" || !!m.meeting_url || g.names.length > 0)
            .map((g) => ({ key: g.value, label: g.short, names: g.names })),
          { key: "none", label: "Not replied", names: notReplied },
        ]
          .map((g) => (
            <details key={g.key} className="group" open={g.key !== "none" && g.names.length > 0 && g.names.length <= 12}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 text-[0.9375rem] font-medium text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>{g.label} <span className="font-normal text-muted tabular">· {g.names.length}</span></span>
                <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
              </summary>
              {g.names.length ? (
                <ul className="flex flex-wrap gap-1.5 px-5 pb-4 sm:px-6">
                  {g.names.map((n, i) => (
                    <li key={`${n}-${i}`} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-ink-2 ring-1 ring-inset ring-line">{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-4 text-sm text-muted sm:px-6">Nobody yet.</p>
              )}
            </details>
          ))}
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={m.title}
        back={{ href: `${base}/meetings`, label: "Meetings" }}
        actions={s.isAdmin ? (
          <>
            <Button href={`${base}/meetings/${m.id}/edit`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit meeting</Button>
            {!cancelled && m.status !== "held" && <CancelMeeting title={m.title} action={cancelMeeting.bind(null, slug, m.id)} />}
          </>
        ) : undefined}
      />

      {sp.created && <Notice tone="ok" title="Meeting created">Every member has been sent a notice.</Notice>}
      {sp.saved && <Notice tone="ok" title="Changes saved">Members are notified when the date, place, link or status changes.</Notice>}
      {sp.cancelled && <Notice tone="warn" title="Meeting cancelled">Every member has been sent a notice.</Notice>}
      {sp.minutes && <Notice tone="ok" title="Minutes saved">Residents can read them on this page.</Notice>}
      {cancelled && !sp.cancelled && <Notice tone="bad" title="This meeting has been cancelled">It will not take place.</Notice>}
      {m.status === "postponed" && <Notice tone="warn" title="This meeting has been postponed">A new date will be announced here.</Notice>}

      {/* When and where */}
      <Card>
        <div className="flex gap-4 sm:gap-5">
          <DateTile date={m.starts_at} timeZone={tz} size="lg" muted={cancelled} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={typeTone(m.meeting_type)} dot={false}>{typeLabel(m.meeting_type)}</Badge>
              <StatusBadge value={m.status} />
            </div>
            <p className="mt-2 text-[1.0625rem] font-medium leading-snug">{longDate(m.starts_at, tz)}</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[0.9375rem] text-ink-2">
              <li className="flex items-start gap-2">
                <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>{timeRange(m.starts_at, m.duration_minutes, tz)} <span className="text-muted">· {durationLabel(m.duration_minutes)} · {zoneLabel(tz, m.starts_at)}</span></span>
              </li>
              {m.location && (
                <li className="flex items-start gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />{m.location}</li>
              )}
              {m.meeting_url && (
                <li className="flex items-start gap-2"><Video aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  {m.location ? `Or join online with ${providerName(m.meeting_url)}` : `Online with ${providerName(m.meeting_url)}`}
                </li>
              )}
            </ul>
          </div>
        </div>
        {goingAhead && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
            {showJoin && (
              <Button href={m.meeting_url!} external size="lg" className="w-full sm:w-auto">
                <Video aria-hidden className="size-5" /> Join meeting<span className="sr-only"> (opens in a new tab)</span>
              </Button>
            )}
            <a href={`${base}/meetings/${m.id}/ics`} download className={buttonClass("secondary", "lg", "w-full sm:w-auto")}>
              <CalendarPlus aria-hidden className="size-5" /> Add to calendar
            </a>
          </div>
        )}
      </Card>

      {/* Two columns on large screens. On phones the columns dissolve ("contents") so the reply buttons,
          the main thing to do before a meeting, come straight after the date instead of below the agenda. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
        <div className="contents lg:col-span-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          {minutes ? <>{minutesCard}{agendaCard}</> : <>{agendaCard}{minutesCard}</>}
          {showRsvp && actionsCard}
          {showRsvp && topicsCard}
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          {showRsvp ? <><div className="order-first min-w-0 lg:order-none">{rsvpCard}</div>{responsesCard}</> : <>{actionsCard}{topicsCard}</>}
        </div>
      </div>
    </div>
  );
}
