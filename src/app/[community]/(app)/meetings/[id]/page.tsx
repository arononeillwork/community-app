import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import clsx from "clsx";
import {
  CalendarDays, CalendarPlus, Check, Download, ExternalLink, FileText, MapPin, Pencil, Users, Video,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice, PageHeader, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import ConfirmForm from "@/components/meetings/ConfirmForm";
import SubmitButton from "@/components/meetings/SubmitButton";
import { ActionItemForm, MinutesForm } from "@/components/meetings/MinutesForm";
import {
  RSVP_OPTIONS, buttonClass, durationLabel, endMs, googleCalendarUrl, meetingType, originFrom, providerName,
  relativeDay, rsvpLabel, safeHttpUrl, timeOnly,
} from "@/components/meetings/meeting-utils";
import { cancelMeeting, rsvp, setActionItemStatus } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ community: string; id: string }> }): Promise<Metadata> {
  const { community, id } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const { data } = await supabase.from("meetings").select("title").eq("id", id).eq("community_id", s.community.id).maybeSingle();
  return { title: data?.title ?? "Meeting" };
}

type Doc = { id: string; title: string; storage_path: string | null };

export default async function MeetingDetail({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { community, id } = await params;
  const { saved } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const slug = s.community.slug;
  const base = `/${slug}`;
  const tz = s.community.timezone;
  const cid = s.community.id;

  const { data: m } = await supabase
    .from("meetings")
    .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, agenda_document_id, status")
    .eq("id", id).eq("community_id", cid).maybeSingle();
  if (!m) notFound();

  const [{ data: rsvpData }, { data: minutes }, { data: actionData }, { data: topicData }, { data: docChoices }] = await Promise.all([
    s.isAdmin
      ? supabase.from("meeting_rsvps").select("profile_id, response, updated_at, profile:profiles(full_name)").eq("meeting_id", m.id)
      : supabase.from("meeting_rsvps").select("profile_id, response, updated_at").eq("meeting_id", m.id),
    supabase.from("meeting_minutes").select("id, summary, decisions, recording_url, document_id, created_at")
      .eq("meeting_id", m.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("action_items").select("id, title, owner_name, due_date, status, created_at")
      .eq("meeting_id", m.id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("v_meeting_topics").select("id, title, description, status, votes")
      .eq("meeting_id", m.id).order("votes", { ascending: false }),
    s.isAdmin
      ? supabase.from("documents").select("id, title, folder").eq("community_id", cid).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: null }),
  ]);

  // Documents are filtered by their visibility (RLS): if a resident may not see one, no link is shown.
  async function loadDoc(docId: string | null | undefined): Promise<(Doc & { fileUrl: string | null }) | null> {
    if (!docId) return null;
    const { data } = await supabase.from("documents").select("id, title, storage_path").eq("id", docId).maybeSingle();
    if (!data) return null;
    const doc = data as Doc;
    const signed = doc.storage_path
      ? (await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600)).data?.signedUrl ?? null
      : null;
    return { ...doc, fileUrl: signed };
  }
  const [minutesDoc, agendaDoc] = await Promise.all([loadDoc(minutes?.document_id), loadDoc(m.agenda_document_id)]);

  const type = meetingType(m.meeting_type);
  const url = safeHttpUrl(m.meeting_url);
  const provider = providerName(url);
  const endsAt = endMs(m.starts_at, m.duration_minutes);
  const ended = endsAt < Date.now();
  const active = m.status === "scheduled" && !ended;
  const canRsvp = active;
  const rel = active ? relativeDay(m.starts_at, tz) : null;
  const detailsUrl = `${originFrom(await headers())}${base}/meetings/${m.id}`;
  const icsHref = `${base}/meetings/${m.id}/calendar.ics`;

  type RsvpRow = { profile_id: string; response: string; updated_at: string; profile?: { full_name: string | null } | null };
  const rsvps = (rsvpData ?? []) as unknown as RsvpRow[];
  const myAnswer = rsvps.find((r) => r.profile_id === s.userId)?.response ?? null;
  const totals = Object.fromEntries(RSVP_OPTIONS.map((o) => [o.value, rsvps.filter((r) => r.response === o.value).length]));
  const rsvpOptions = RSVP_OPTIONS.filter((o) => o.value !== "online" || url || myAnswer === "online");
  const totalsText = [
    `${totals.attending ?? 0} attending in person`,
    ...(url || totals.online ? [`${totals.online ?? 0} joining online`] : []),
    `${totals.not_attending ?? 0} not attending`,
  ].join(" · ");

  const decisions: string[] = Array.isArray(minutes?.decisions) ? minutes.decisions : [];
  const actionItems = (actionData ?? []).map((a) => ({
    id: a.id as string, title: a.title as string, owner_name: (a.owner_name as string | null) ?? "",
    // undefined (not null) so rows without a date sort last
    due_date: (a.due_date as string | null) ?? undefined,
    status: a.status as string,
  }));
  const actionColumns: Column[] = [
    { key: "title", header: "What needs doing", primary: true },
    { key: "owner_name", header: "Who" },
    { key: "due_date", header: "Due by", type: "date" },
    { key: "status", header: "Status", type: "status", filter: true },
  ];
  const topics = (topicData ?? []) as { id: string; title: string; description: string | null; status: string; votes: number | null }[];
  const showMinutes = m.status === "held" || !!minutes || actionItems.length > 0;

  const rsvpRows = rsvps.map((r) => ({
    id: r.profile_id,
    name: r.profile?.full_name || "Resident",
    answer: rsvpLabel(r.response),
    updated_at: r.updated_at,
  }));
  const rsvpColumns: Column[] = [
    { key: "name", header: "Name", primary: true },
    { key: "answer", header: "Answer", filter: true },
    { key: "updated_at", header: "Answered on", type: "date" },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={m.title}
        back={{ href: `${base}/meetings`, label: "Meetings" }}
        actions={s.isAdmin ? (
          <Button href={`${base}/meetings/${m.id}/edit`} variant="secondary" size="lg"><Pencil aria-hidden className="size-5" /> Edit meeting</Button>
        ) : undefined}
      />

      {saved === "notified" && <Notice tone="ok">Saved. Every resident has been sent a message about this meeting.</Notice>}
      {saved === "1" && <Notice tone="ok">Your changes have been saved.</Notice>}
      {m.status === "cancelled" && <Notice tone="bad">This meeting has been cancelled. It will not take place.</Notice>}
      {m.status === "postponed" && <Notice tone="warn">This meeting has been postponed. A new date will be announced.</Notice>}

      {/* ------------------------------------------------------------ When and where */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={type.tone}>{type.short}</Badge>
          <StatusBadge value={m.status} />
          {rel && <Badge tone="ok">{rel}</Badge>}
        </div>
        <p className="text-muted"><strong className="text-ink">{type.label}:</strong> {type.help}</p>
        <dl className="grid gap-x-6 gap-y-4 text-lg sm:grid-cols-[auto_1fr]">
          <dt className="flex items-center gap-2 font-bold"><CalendarDays aria-hidden className="size-6 text-brand" /> When</dt>
          <dd>
            <span className={clsx("block font-bold", m.status === "cancelled" && "line-through")}>{dateTime(m.starts_at, tz)}</span>
            <span className="block text-muted">Until {timeOnly(endsAt, tz)} ({durationLabel(m.duration_minutes)}). Local time, {tz}.</span>
          </dd>
          <dt className="flex items-center gap-2 font-bold"><MapPin aria-hidden className="size-6 text-brand" /> Where</dt>
          <dd>{m.location ?? (url ? "Online only" : "Place to be confirmed")}</dd>
          {url && (
            <>
              <dt className="flex items-center gap-2 font-bold"><Video aria-hidden className="size-6 text-brand" /> Online</dt>
              <dd>
                <span className="block">{provider ? `${provider} meeting` : "Online meeting"}. Link:</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-brand underline underline-offset-4">
                  {url}<span className="sr-only"> (opens in a new window)</span>
                </a>
              </dd>
            </>
          )}
        </dl>
        {active && url && (
          <div className="no-print flex flex-col gap-2">
            <Button href={url} external size="lg" className="min-h-16 w-full text-xl sm:w-fit">
              <Video aria-hidden className="size-7" /> Join meeting<span className="sr-only"> (opens in a new window)</span>
            </Button>
            <p className="hint">
              Opens {provider ?? "the online meeting"} in a new window. The meeting is not held on this website.
              {provider ? ` If it asks, you can join from your web browser or the ${provider} app.` : ""}
            </p>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ Calendar */}
      {active && (
        <Card className="no-print flex flex-col gap-3">
          <h2 className="text-xl font-bold">Add to your calendar</h2>
          <p className="text-muted">Save the date so your phone or computer can remind you.</p>
          <div className="flex flex-wrap gap-2">
            <a href={icsHref} download className={buttonClass("secondary", "lg")}>
              <Download aria-hidden className="size-6" /> Download calendar file
            </a>
            <Button href={googleCalendarUrl(m, detailsUrl)} external variant="secondary" size="lg">
              <CalendarPlus aria-hidden className="size-6" /> Google Calendar<span className="sr-only"> (opens in a new window)</span>
            </Button>
          </div>
          <p className="hint">The calendar file works with Apple Calendar (iPhone, iPad, Mac), Outlook and most other calendar apps. It includes reminders one day and one hour before.</p>
        </Card>
      )}

      {/* ------------------------------------------------------------ RSVP */}
      {canRsvp ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Will you come?</h2>
          <p className="text-muted">Let the committee know, so they can plan the room and the online call. You can change your answer at any time.</p>
          <div className="no-print grid gap-3 sm:grid-cols-3">
            {rsvpOptions.map((o) => {
              const on = myAnswer === o.value;
              return (
                <form key={o.value} action={rsvp.bind(null, slug, m.id, o.value)}>
                  <SubmitButton pressed={on} pendingLabel="Saving…"
                    className={clsx("flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-lg font-bold transition-colors",
                      on ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:border-brand")}>
                    {on && <Check aria-hidden className="size-6" />} {o.label}
                  </SubmitButton>
                </form>
              );
            })}
          </div>
          <p className="text-lg font-bold" aria-live="polite">
            {myAnswer ? `Your answer: ${rsvpLabel(myAnswer)}.` : "You have not answered yet."}
          </p>
          <p className="flex items-center gap-2 text-muted"><Users aria-hidden className="size-5" /> So far: {totalsText}</p>
        </Card>
      ) : rsvps.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Replies</h2>
          <p className="flex items-center gap-2"><Users aria-hidden className="size-5" /> {totalsText}</p>
        </Card>
      )}

      {/* ------------------------------------------------------------ Agenda */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Agenda</h2>
        {m.agenda ? <p className="whitespace-pre-line text-lg">{m.agenda}</p> : <p className="text-muted">The agenda has not been published yet.</p>}
        {agendaDoc && <DocLink doc={agendaDoc} base={base} label="Agenda document" />}
        {topics.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="text-lg font-bold">Topics suggested by residents</h3>
            <ul className="flex flex-col gap-3">
              {topics.map((t) => (
                <li key={t.id} className="rounded-xl border-l-4 border-brand bg-bg p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{t.title}</span>
                    <StatusBadge value={t.status} />
                  </div>
                  {t.description && <p className="mt-1 whitespace-pre-line">{t.description}</p>}
                  <p className="mt-1 text-muted">{t.votes ?? 0} {(t.votes ?? 0) === 1 ? "resident supports" : "residents support"} this topic.</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.isAdmin && active && (
          <p className="no-print hint">
            To add a suggested topic to this agenda, go to <Link href={`${base}/meetings#topics`} className="font-bold text-brand underline">Suggested topics</Link> and use “Manage this topic”.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------ Minutes (after the meeting) */}
      {showMinutes && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Minutes: what was decided</h2>
          <p className="text-muted">The minutes are the official written record of the meeting.</p>
          {minutes?.summary ? (
            <p className="whitespace-pre-line text-lg">{minutes.summary}</p>
          ) : (
            <p className="text-muted">The minutes have not been added yet.</p>
          )}
          {decisions.length > 0 && (
            <div>
              <h3 className="mb-2 text-lg font-bold">Decisions</h3>
              <ol className="flex list-decimal flex-col gap-1 pl-7 text-lg">
                {decisions.map((d, i) => <li key={i}>{d}</li>)}
              </ol>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {minutesDoc && <DocLink doc={minutesDoc} base={base} label="Read the full minutes" />}
            {safeHttpUrl(minutes?.recording_url) && (
              <Button href={safeHttpUrl(minutes?.recording_url)!} external variant="secondary">
                <Video aria-hidden className="size-5" /> Watch the recording<span className="sr-only"> (opens in a new window)</span>
              </Button>
            )}
          </div>
        </Card>
      )}

      {showMinutes && (
        <section aria-labelledby="actions-heading" className="flex flex-col gap-3">
          <h2 id="actions-heading" className="text-xl font-bold">Action items</h2>
          <p className="text-muted">Things the meeting agreed should be done, who does them, and by when.</p>
          {actionItems.length === 0 ? (
            <Empty title="No action items were recorded." />
          ) : (
            <DataTable
              id="act_"
              rows={actionItems}
              columns={actionColumns}
              dateKey="due_date"
              defaultSort={{ key: "due_date" }}
              exportName="action-items"
              searchPlaceholder="Search action items…"
              empty="No action items match."
            />
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ Admin */}
      {s.isAdmin && (
        <Card className="no-print flex flex-col gap-4 border-2 border-line-strong">
          <h2 className="text-xl font-bold">For administrators</h2>

          {rsvps.length > 0 && (
            <details className="rounded-xl border-2 border-line">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-bold">Who has answered ({rsvps.length})</summary>
              <div className="border-t border-line p-4">
                <DataTable id="rsvp_" rows={rsvpRows} columns={rsvpColumns} defaultSort={{ key: "name" }}
                  exportName="meeting-replies" searchPlaceholder="Search names…" empty="No replies yet." />
              </div>
            </details>
          )}

          {(ended || m.status === "held") && m.status !== "cancelled" && (
            <>
              <details className="rounded-xl border-2 border-line" open={m.status === "held" && !minutes}>
                <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-bold">
                  {minutes ? "Edit the minutes" : "Add the minutes"}
                </summary>
                <div className="border-t border-line p-4">
                  {m.status !== "held" && (
                    <p className="hint mb-3">Tip: use “Edit meeting” to change the status to “Held”.</p>
                  )}
                  <MinutesForm
                    slug={slug}
                    meetingId={m.id}
                    documents={(docChoices ?? []) as { id: string; title: string; folder: string | null }[]}
                    initial={{
                      summary: minutes?.summary ?? "",
                      decisions: decisions.join("\n"),
                      recording_url: minutes?.recording_url ?? "",
                      document_id: minutes?.document_id ?? "",
                    }}
                  />
                </div>
              </details>

              <details className="rounded-xl border-2 border-line">
                <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-bold">Action items: add or mark as done</summary>
                <div className="flex flex-col gap-5 border-t border-line p-4">
                  <ActionItemForm slug={slug} meetingId={m.id} />
                  {actionItems.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {actionItems.map((a) => (
                        <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                          <span>
                            <span className="font-bold">{a.title}</span>{" "}
                            <StatusBadge value={a.status} />
                            <span className="block text-sm text-muted">
                              {[a.owner_name, a.due_date ? `due ${date(a.due_date)}` : ""].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <form action={setActionItemStatus.bind(null, slug, a.id, a.status === "done" ? "open" : "done")}>
                            <SubmitButton className={buttonClass("secondary")} pendingLabel="Saving…">
                              {a.status === "done" ? "Mark as not done" : "Mark as done"}
                              <span className="sr-only">: {a.title}</span>
                            </SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </>
          )}

          {m.status === "cancelled" && (
            <p className="text-muted">This meeting is cancelled. To bring it back, use “Edit meeting” and set the status to “Scheduled”.</p>
          )}

          {(m.status === "scheduled" || m.status === "postponed") && !ended && (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold">Cancel this meeting</h3>
              <p className="text-muted">Every resident will get a message that the meeting is cancelled. You can undo this later with “Edit meeting”.</p>
              <ConfirmForm
                action={cancelMeeting.bind(null, slug, m.id)}
                trigger="Cancel meeting"
                triggerVariant="danger"
                question={<>Cancel “{m.title}”? Every resident will be told that it is not taking place.</>}
                confirmLabel="Yes, cancel the meeting"
                cancelLabel="No, keep the meeting"
                className="w-fit"
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function DocLink({ doc, base, label }: { doc: Doc & { fileUrl: string | null }; base: string; label: string }) {
  if (doc.fileUrl) {
    return (
      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
        <FileText aria-hidden className="size-5" /> {label}: {doc.title}
        <ExternalLink aria-hidden className="size-4" /><span className="sr-only"> (opens in a new window)</span>
      </a>
    );
  }
  return (
    <Link href={`${base}/documents/${doc.id}`} className={buttonClass("secondary")}>
      <FileText aria-hidden className="size-5" /> {label}: {doc.title}
    </Link>
  );
}
