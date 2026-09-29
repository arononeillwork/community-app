"use client";

import { useState, type FormEvent } from "react";
import { Notice } from "@/components/ui";
import { money, parseEurosToCents } from "@/lib/format";
import { useFormAction } from "@/components/finance/fees/useFormAction";
import { createLevy, type FormState } from "../actions";

type Props = { slug: string; defaultDue: string; sampleCoef: number; totalCoef: number; unitCount: number; currency: string };

export default function LevyForm(props: Props) {
  const [state, onSubmit, pending] = useFormAction(createLevy.bind(null, props.slug));
  // A new key after each success clears the whole form, including the typed total.
  return <LevyFields key={state?.stamp ?? "new"} {...props} state={state} onSubmit={onSubmit} pending={pending} />;
}

function LevyFields({ defaultDue, sampleCoef, totalCoef, unitCount, currency, state, onSubmit, pending }: Props & {
  state: FormState; onSubmit: (e: FormEvent<HTMLFormElement>) => void; pending: boolean;
}) {
  const [total, setTotal] = useState("");
  const cents = parseEurosToCents(total) ?? 0;
  const m = (c: number) => money(c, currency);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}

      <div className="field">
        <label htmlFor="levy-title">Name of the levy</label>
        <input id="levy-title" name="title" required minLength={3} maxLength={120} className="input" placeholder="e.g. Roof repair Block C" />
      </div>
      <div className="field">
        <label htmlFor="levy-desc">What is it for? <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="levy-desc" name="description" maxLength={2000} className="input" placeholder="e.g. Approved at the extraordinary meeting of 12 September" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="levy-total">Total to collect from all flats (€)</label>
          <input id="levy-total" name="total" required inputMode="decimal" autoComplete="off" className="input tabular"
            value={total} onChange={(e) => setTotal(e.target.value)} aria-describedby="levy-total-hint" />
          <p id="levy-total-hint" className="hint">
            {cents > 0 && totalCoef > 0 && sampleCoef > 0
              ? <>A flat with a {sampleCoef.toFixed(2)}% share would pay about {m(Math.round((cents * sampleCoef) / totalCoef))}.</>
              : <>It is split between the {unitCount} flats by their share.</>}
          </p>
        </div>
        <div className="field">
          <label htmlFor="levy-due">Owners must pay by</label>
          <input id="levy-due" name="due_date" type="date" required defaultValue={defaultDue} className="input" />
        </div>
      </div>
      <label className="flex items-start gap-3 rounded-xl border-2 border-warn/40 bg-warn-soft p-4 font-bold">
        <input type="checkbox" name="confirm" required className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
        I have checked the amount and the date. Charge every flat its share now.
      </label>
      <button type="submit" disabled={pending} className="min-h-14 w-full rounded-xl border-2 border-brand bg-surface px-6 text-lg font-bold text-ink hover:bg-brand-soft disabled:opacity-60 sm:w-fit">
        {pending ? "Creating…" : "Create the levy and charge the flats"}
      </button>
    </form>
  );
}
