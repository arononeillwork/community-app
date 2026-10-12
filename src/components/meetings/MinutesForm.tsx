"use client";

import { useActionState, useState } from "react";
import { FilePlus2, Pencil } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import type { FormState } from "@/app/[community]/(app)/meetings/actions";
import { FieldError, fieldProps, keepValuesSubmit } from "./form-bits";

export type MinutesValues = { summary: string; decisions: string; recording_url: string; document_id: string };

/** Admin: add or edit the minutes of a meeting that has taken place. Starts collapsed behind one button. */
export function MinutesForm({ action, initial, documents, showMarkHeld, editing }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: MinutesValues;
  documents: { id: string; label: string }[];
  /** Offer "Mark the meeting as held" (the meeting is not yet marked held). */
  showMarkHeld: boolean;
  /** Minutes already exist. */
  editing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(editing ? "ghost" : "primary", editing ? "sm" : "md", "w-fit")}>
        {editing ? <Pencil aria-hidden className="size-4" /> : <FilePlus2 aria-hidden className="size-4" />}
        {editing ? "Edit minutes" : "Add minutes"}
      </button>
    );
  }

  return (
    <form action={formAction} onSubmit={keepValuesSubmit(formAction)} noValidate
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
      <h3 className="font-medium">{editing ? "Edit the minutes" : "Add the minutes"}</h3>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <div className="field">
        <label htmlFor="summary">Summary</label>
        <textarea {...fieldProps("summary", e)} defaultValue={initial.summary} rows={4} maxLength={5000}
          className="input aria-invalid:border-bad" placeholder="What was discussed, in a few plain sentences" />
        <FieldError name="summary" errors={e} />
      </div>
      <div className="field">
        <label htmlFor="decisions">Decisions</label>
        <textarea {...fieldProps("decisions", e, "decisions-hint")} defaultValue={initial.decisions} rows={4}
          className="input aria-invalid:border-bad" placeholder={"Accounts approved\nBudget approved (+3%)"} />
        <FieldError name="decisions" errors={e} />
        <p id="decisions-hint" className="hint">One decision per line.</p>
      </div>
      <div className="field">
        <label htmlFor="recording_url">Recording link <span className="font-normal text-muted">· optional</span></label>
        <input type="url" inputMode="url" {...fieldProps("recording_url", e)} defaultValue={initial.recording_url} maxLength={500}
          className="input aria-invalid:border-bad" placeholder="https://" />
        <FieldError name="recording_url" errors={e} />
      </div>
      <div className="field">
        <label htmlFor="document_id">Full minutes document <span className="font-normal text-muted">· optional</span></label>
        <select {...fieldProps("document_id", e, "document_id-hint")} defaultValue={initial.document_id} className="input aria-invalid:border-bad">
          <option value="">No document</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <FieldError name="document_id" errors={e} />
        <p id="document_id-hint" className="hint">Upload the signed minutes in Documents first, then choose them here.</p>
      </div>
      {showMarkHeld && (
        <label className="flex cursor-pointer items-center gap-3 text-[0.9375rem]">
          <input type="checkbox" name="mark_held" defaultChecked className="size-5 accent-[var(--brand)]" />
          Mark the meeting as held
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "Saving…" : "Save minutes"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>Close</button>
      </div>
    </form>
  );
}
