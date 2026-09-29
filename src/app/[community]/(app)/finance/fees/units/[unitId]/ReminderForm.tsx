"use client";

import { Notice } from "@/components/ui";
import { REMINDER_CHANNELS } from "@/components/finance/fees/utils";
import { useFormAction } from "@/components/finance/fees/useFormAction";
import { logReminder } from "../../actions";

export default function ReminderForm({ slug, unitId }: { slug: string; unitId: string }) {
  const [state, onSubmit, pending] = useFormAction(logReminder.bind(null, slug, unitId));

  return (
    <form key={state?.stamp ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">How was the owner reminded?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REMINDER_CHANNELS.map((c, i) => (
            <label key={c.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line px-3 font-bold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="channel" value={c.value} defaultChecked={i === 0} className="size-5 accent-[var(--brand)]" />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="rem-note">Note <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="rem-note" name="note" maxLength={1000} className="input" placeholder="e.g. Second reminder, owner promised to pay next week" />
      </div>
      <p className="hint">This only records that a reminder was sent. It does not send anything to the owner.</p>
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink hover:bg-bg disabled:opacity-60 sm:w-fit">
        {pending ? "Saving…" : "Log reminder"}
      </button>
    </form>
  );
}
