"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { saveMeeting, type FormState } from "@/app/[community]/(app)/meetings/actions";
import { Card, Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import { MEETING_STATUSES, MEETING_TYPES, buttonClass, durationLabel } from "./meeting-utils";

export type MeetingFormValues = {
  id?: string;
  title: string;
  meeting_type: string;
  /** "YYYY-MM-DDTHH:mm" in the community's time zone. */
  starts_at: string;
  duration_minutes: string;
  location: string;
  meeting_url: string;
  agenda: string;
  status: string;
};

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240];

/** Shared by "Plan a meeting" and "Edit meeting". Saving notifies every resident (DB trigger). */
export default function MeetingForm({
  slug, timezone, initial, cancelHref, minStart,
}: {
  slug: string;
  timezone: string;
  initial: MeetingFormValues;
  cancelHref: string;
  /** Earliest allowed start for new meetings ("YYYY-MM-DDTHH:mm"). */
  minStart?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveMeeting.bind(null, slug), undefined);
  const v: MeetingFormValues = { ...initial, ...(state?.values ?? {}) };
  const [type, setType] = useState(v.meeting_type || "informal");
  const editing = !!initial.id;
  const durations = DURATIONS.includes(Number(v.duration_minutes)) || !v.duration_minutes
    ? DURATIONS : [...DURATIONS, Number(v.duration_minutes)].sort((a, b) => a - b);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {editing && <input type="hidden" name="id" value={initial.id} />}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. What is the meeting?</h2>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required minLength={3} maxLength={200} className="input" defaultValue={v.title}
            placeholder="e.g. Annual General Meeting 2026" />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-bold">Type of meeting</legend>
          {MEETING_TYPES.map((t) => (
            <label key={t.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${type === t.value ? "border-brand bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="meeting_type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)}
                className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
              <span><span className="block text-lg font-bold">{t.label}</span><span className="text-muted">{t.help}</span></span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. When?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="starts_at">Date and start time</label>
            <input id="starts_at" name="starts_at" type="datetime-local" required className="input" defaultValue={v.starts_at}
              min={editing ? undefined : minStart} aria-describedby="starts_at-hint" />
            <p id="starts_at-hint" className="hint">Local time of the community ({timezone}).</p>
          </div>
          <div className="field">
            <label htmlFor="duration_minutes">How long?</label>
            <select id="duration_minutes" name="duration_minutes" className="input" defaultValue={v.duration_minutes || "60"}>
              {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Where?</h2>
        <p className="text-muted">Meetings happen in person, online, or both. This website does not host the meeting; it only tells residents where to go.</p>
        <div className="field">
          <label htmlFor="location">Place <span className="font-normal text-muted">(if meeting in person)</span></label>
          <input id="location" name="location" maxLength={300} className="input" defaultValue={v.location}
            placeholder="e.g. Community room, Block A" aria-describedby="location-hint" />
          <p id="location-hint" className="hint">Leave empty if the meeting is online only.</p>
        </div>
        <div className="field">
          <label htmlFor="meeting_url">Online meeting link <span className="font-normal text-muted">(Zoom, Teams or Google Meet)</span></label>
          <input id="meeting_url" name="meeting_url" type="url" maxLength={2000} className="input" defaultValue={v.meeting_url}
            placeholder="https://zoom.us/j/…" aria-describedby="meeting_url-hint" />
          <p id="meeting_url-hint" className="hint">Paste the full invitation link, starting with https://. Leave empty if the meeting is in person only.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">4. Agenda and status</h2>
        <div className="field">
          <label htmlFor="agenda">Agenda <span className="font-normal text-muted">(the list of subjects)</span></label>
          <textarea id="agenda" name="agenda" maxLength={10000} className="input min-h-40" defaultValue={v.agenda}
            placeholder={"1. Approval of the accounts\n2. Budget for next year\n3. Any other business"} aria-describedby="agenda-hint" />
          <p id="agenda-hint" className="hint">Write one subject per line. You can put suggested topics on the agenda from the Meetings page.</p>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={v.status || "scheduled"}>
            {MEETING_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}: {st.help}</option>)}
          </select>
        </div>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border-2 border-info/30 bg-info-soft p-4 text-info">
        <BellRing aria-hidden className="mt-0.5 size-6 shrink-0" />
        <p className="font-bold">
          {editing
            ? "If you change the date, time, place, link or status, every resident gets a message about the change."
            : "When you save, every resident gets a message about this meeting."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className={`${buttonClass("primary", "lg")} min-h-16 text-xl`} pendingLabel="Saving…">
          {editing ? "Save changes" : "Save and notify residents"}
        </SubmitButton>
        <Link href={cancelHref} className={buttonClass("ghost", "lg")}>Go back without saving</Link>
      </div>
    </form>
  );
}
