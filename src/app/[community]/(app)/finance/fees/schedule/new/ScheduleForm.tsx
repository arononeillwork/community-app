"use client";

import { useActionState, useState } from "react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { parseEurosToCents } from "@/lib/format";
import { createSchedule, type FeeFormState } from "../../actions";

const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
const PERIODS: Record<string, number> = { monthly: 12, quarterly: 4, yearly: 1 };

export default function ScheduleForm({ slug, year, budgets, flats, previous, cancelHref }: {
  slug: string;
  year: number;
  /** Approved or draft budget totals by year, to prefill the amount. */
  budgets: Record<string, number>;
  flats: number;
  previous: { frequency: string; method: string } | null;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<FeeFormState, FormData>(createSchedule.bind(null, slug), undefined);
  const [y, setY] = useState(String(year));
  const [method, setMethod] = useState(previous?.method ?? "coefficient");
  const [frequency, setFrequency] = useState(previous?.frequency ?? "quarterly");
  // Prefill with that year's budget, or else the most recent budget as a starting point.
  const latest = Object.keys(budgets).sort().at(-1);
  const startFrom = budgets[String(year)] ? String(year) : latest;
  const [annual, setAnnual] = useState(startFrom ? (budgets[startFrom] / 100).toFixed(2) : "");
  const [fixed, setFixed] = useState("");

  const annualCents = parseEurosToCents(annual);
  const per = PERIODS[frequency] ?? 4;
  const preview = method === "coefficient"
    ? annualCents && annualCents > 0 ? `About ${fmt.format(annualCents / 100 / per / Math.max(1, flats))} per flat per ${frequency === "monthly" ? "month" : frequency === "quarterly" ? "quarter" : "year"} on average.` : null
    : (() => { const f = parseEurosToCents(fixed); return f && f > 0 ? `${fmt.format((f * per * flats) / 100)} a year in total.` : null; })();

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="year">Year</label>
            <input id="year" name="year" type="number" min={2000} max={2100} className="input tabular" required value={y}
              onChange={(e) => { setY(e.target.value); if (budgets[e.target.value]) setAnnual((budgets[e.target.value] / 100).toFixed(2)); }} />
          </div>
          <div className="field">
            <label htmlFor="frequency">Owners pay</label>
            <select id="frequency" name="frequency" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Once a year</option>
            </select>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-medium text-ink">How the fees are split</legend>
          {[
            { v: "coefficient", t: "By participation coefficient", d: "A yearly total shared out by each flat's percentage (usual in Spain)." },
            { v: "fixed", t: "Same amount for every flat", d: "Each flat pays a fixed amount per period." },
          ].map((o) => (
            <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${method === o.v ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="method" value={o.v} checked={method === o.v} onChange={() => setMethod(o.v)} className="mt-1 size-5 accent-[var(--brand)]" />
              <span><span className="block font-medium text-ink">{o.t}</span><span className="text-[0.9375rem] text-muted">{o.d}</span></span>
            </label>
          ))}
        </fieldset>

        {method === "coefficient" ? (
          <div className="field">
            <label htmlFor="annual_total">Total to collect in the year (€)</label>
            <input id="annual_total" name="annual_total" inputMode="decimal" className="input tabular" required value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="60000.00" aria-describedby="amount_hint" />
            <p id="amount_hint" className="hint">
              {budgets[y] ? `Prefilled with the ${y} budget total. ` : latest ? `There is no ${y} budget yet, so this is the ${latest} total. ` : ""}{preview}
            </p>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="fixed_amount">Each flat pays per period (€)</label>
            <input id="fixed_amount" name="fixed_amount" inputMode="decimal" className="input tabular" required value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="250.00" aria-describedby="amount_hint" />
            <p id="amount_hint" className="hint">{preview}</p>
          </div>
        )}
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : "Save schedule"}</button>
      </div>
    </form>
  );
}
