"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Notice, buttonClass } from "@/components/ui";
import type { FormState } from "@/app/[community]/(app)/meetings/actions";
import { MEETING_STATUSES, MEETING_TYPES, durationLabel } from "./meeting-utils";
import { FieldError, fieldProps, keepValuesSubmit } from "./form-bits";

export type MeetingValues = {
  id?: string;
  title: string;
  meeting_type: string;
  starts_at: string; // "YYYY-MM-DDTHH:mm" in the community's time zone
  duration_minutes: number;
  location: string;
  meeting_url: string;
  agenda: string;
  status: string;
};

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240];

export function MeetingForm({ action, initial, zone, cancelHref }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: MeetingValues;
  /** e.g. "Madrid time (CEST)" */
  zone: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors;
  const durations = DURATIONS.includes(initial.duration_minutes) ? DURATIONS : [...DURATIONS, initial.duration_minutes].sort((a, b) => a - b);
  const isNew = !initial.id;

  return (
    <form action={formAction} onSubmit={keepValuesSubmit(formAction)} noValidate className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">The meeting</h2>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input {...fieldProps("title", e)} defaultValue={initial.title} required maxLength={200}
            className="input aria-invalid:border-bad" placeholder="e.g. Annual General Meeting 2027" />
          <FieldError name="title" errors={e} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="meeting_type">Type</label>
            <select {...fieldProps("meeting_type", e)} defaultValue={initial.meeting_type} className="input aria-invalid:border-bad">
              {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.long}</option>)}
            </select>
            <FieldError name="meeting_type" errors={e} />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select {...fieldProps("status", e)} defaultValue={initial.status} className="input aria-invalid:border-bad">
              {MEETING_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <FieldError name="status" errors={e} />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">When and where</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="starts_at">Date and start time</label>
            <input type="datetime-local" {...fieldProps("starts_at", e, "starts_at-hint")} defaultValue={initial.starts_at} required
              className="input aria-invalid:border-bad" />
            <FieldError name="starts_at" errors={e} />
            <p id="starts_at-hint" className="hint">{zone}</p>
          </div>
          <div className="field">
            <label htmlFor="duration_minutes">Length</label>
            <select {...fieldProps("duration_minutes", e)} defaultValue={String(initial.duration_minutes)} className="input aria-invalid:border-bad">
              {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
            </select>
            <FieldError name="duration_minutes" errors={e} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="location">Place</label>
          <input {...fieldProps("location", e, "location-hint")} defaultValue={initial.location} maxLength={200}
            className="input aria-invalid:border-bad" placeholder="e.g. Community room, Block A" />
          <FieldError name="location" errors={e} />
          <p id="location-hint" className="hint">Leave empty for an online-only meeting.</p>
        </div>
        <div className="field">
          <label htmlFor="meeting_url">Link to join online <span className="font-normal text-muted">· optional</span></label>
          <input type="url" inputMode="url" {...fieldProps("meeting_url", e, "meeting_url-hint")} defaultValue={initial.meeting_url} maxLength={500}
            className="input aria-invalid:border-bad" placeholder="https://zoom.us/j/…" />
          <FieldError name="meeting_url" errors={e} />
          <p id="meeting_url-hint" className="hint">Zoom, Teams or Google Meet. Residents get a Join button.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="agenda" className="!text-[1.0625rem] !font-semibold">Agenda</label>
          <p id="agenda-hint" className="hint -mt-1">One item per line. Numbers are added for you.</p>
          <textarea {...fieldProps("agenda", e, "agenda-hint")} defaultValue={initial.agenda} rows={6} maxLength={4000}
            className="input aria-invalid:border-bad" placeholder={"Approval of last year's accounts\nBudget for next year\nAny other business"} />
          <FieldError name="agenda" errors={e} />
        </div>
      </Card>

      {isNew && <p className="text-[0.9375rem] text-muted">Every member gets a notice when you create the meeting.</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonClass("ghost", "lg")}>Back without saving</Link>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Saving…" : isNew ? "Create meeting" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
