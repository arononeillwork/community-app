"use client";

import { useActionState } from "react";
import { addActionItem, saveMinutes, type FormState } from "@/app/[community]/(app)/meetings/actions";
import { Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import { buttonClass } from "./meeting-utils";

type Doc = { id: string; title: string; folder: string | null };

/** Admin: write or correct the minutes of a meeting. */
export function MinutesForm({
  slug, meetingId, initial, documents,
}: {
  slug: string;
  meetingId: string;
  initial: { summary: string; decisions: string; recording_url: string; document_id: string };
  documents: Doc[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveMinutes.bind(null, slug, meetingId), undefined);
  const v = { ...initial, ...(state?.values ?? {}) };
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <div className="field">
        <label htmlFor="minutes-summary">Summary in plain language</label>
        <textarea id="minutes-summary" name="summary" className="input min-h-40" defaultValue={v.summary}
          placeholder="What was discussed and agreed, in a few sentences." />
      </div>
      <div className="field">
        <label htmlFor="minutes-decisions">Decisions</label>
        <textarea id="minutes-decisions" name="decisions" className="input" defaultValue={v.decisions}
          placeholder={"Accounts approved\nBudget approved (+3%)"} aria-describedby="minutes-decisions-hint" />
        <p id="minutes-decisions-hint" className="hint">One decision per line.</p>
      </div>
      <div className="field">
        <label htmlFor="minutes-document">Minutes document <span className="font-normal text-muted">(optional)</span></label>
        <select id="minutes-document" name="document_id" className="input" defaultValue={v.document_id}>
          <option value="">No document</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.folder ? `${d.folder}: ` : ""}{d.title}</option>)}
        </select>
        <p className="hint">Upload the document in Documents first, then choose it here.</p>
      </div>
      <div className="field">
        <label htmlFor="minutes-recording">Recording link <span className="font-normal text-muted">(optional)</span></label>
        <input id="minutes-recording" name="recording_url" type="url" className="input" defaultValue={v.recording_url} placeholder="https://…" />
      </div>
      <div>
        <SubmitButton className={buttonClass("primary")} pendingLabel="Saving…">Save the minutes</SubmitButton>
      </div>
    </form>
  );
}

/** Admin: add a follow-up action agreed at the meeting. */
export function ActionItemForm({ slug, meetingId }: { slug: string; meetingId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addActionItem.bind(null, slug, meetingId), undefined);
  const v = state?.values;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <div className="field">
        <label htmlFor="action-title">What needs to be done?</label>
        <input id="action-title" name="title" required minLength={3} maxLength={300} className="input" defaultValue={v?.title ?? ""}
          placeholder="e.g. Get three quotes for the roof" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="action-owner">Who will do it? <span className="font-normal text-muted">(optional)</span></label>
          <input id="action-owner" name="owner_name" maxLength={120} className="input" defaultValue={v?.owner_name ?? ""} placeholder="e.g. Administrator" />
        </div>
        <div className="field">
          <label htmlFor="action-due">Due by <span className="font-normal text-muted">(optional)</span></label>
          <input id="action-due" name="due_date" type="date" className="input" defaultValue={v?.due_date ?? ""} />
        </div>
      </div>
      <div>
        <SubmitButton className={buttonClass("secondary")} pendingLabel="Adding…">Add this action</SubmitButton>
      </div>
    </form>
  );
}
