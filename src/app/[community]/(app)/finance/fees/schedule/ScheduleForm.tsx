"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import { centsToInput, money, parseEurosToCents } from "@/lib/format";
import { FREQUENCIES, frequencyInfo } from "@/components/finance/fees/utils";
import { useFormAction } from "@/components/finance/fees/useFormAction";
import { createSchedule } from "../actions";

type BudgetInfo = { cents: number; name: string; status: string };

export default function ScheduleForm({ slug, years, defaultYear, budgets, sampleCoef, totalCoef, unitCount, currency }: {
  slug: string;
  years: number[];
  defaultYear: number;
  budgets: Record<string, BudgetInfo>;
  sampleCoef: number;
  totalCoef: number;
  unitCount: number;
  currency: string;
}) {
  const [state, onSubmit, pending] = useFormAction(createSchedule.bind(null, slug));
  const [year, setYear] = useState(defaultYear);
  const [method, setMethod] = useState<"coefficient" | "fixed">("coefficient");
  const [frequency, setFrequency] = useState<string>("quarterly");
  const [annual, setAnnual] = useState(budgets[defaultYear] ? centsToInput(budgets[defaultYear].cents) : "");
  const [touched, setTouched] = useState(false);
  const [fixed, setFixed] = useState("");
  const m = (c: number) => money(c, currency);
  const f = frequencyInfo(frequency);
  const budget = budgets[year];
  const annualCents = parseEurosToCents(annual) ?? 0;
  const fixedCents = parseEurosToCents(fixed) ?? 0;

  function changeYear(y: number) {
    setYear(y);
    if (!touched) setAnnual(budgets[y] ? centsToInput(budgets[y].cents) : "");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sch-year">Year</label>
          <select id="sch-year" name="year" className="input" value={year} onChange={(e) => changeYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sch-frequency">How often do owners pay?</label>
          <select id="sch-frequency" name="frequency" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((fr) => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">How is each flat’s fee worked out?</legend>
        {[
          { v: "coefficient" as const, t: "By each flat’s share (coefficient)", d: "The usual way: bigger shares pay more. You enter the total the community needs for the year." },
          { v: "fixed" as const, t: "The same amount for every flat", d: "Every flat pays the same, whatever its size." },
        ].map((o) => (
          <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${method === o.v ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="method" value={o.v} checked={method === o.v} onChange={() => setMethod(o.v)} className="mt-1 size-6 accent-[var(--brand)]" />
            <span><span className="block text-lg font-bold">{o.t}</span><span className="text-muted">{o.d}</span></span>
          </label>
        ))}
      </fieldset>

      {method === "coefficient" ? (
        <div className="field">
          <label htmlFor="sch-annual">Total to collect in {year} (€)</label>
          <input id="sch-annual" name="annual_total" required inputMode="decimal" autoComplete="off" className="input tabular"
            value={annual} onChange={(e) => { setAnnual(e.target.value); setTouched(true); }} aria-describedby="sch-annual-hint" />
          <p id="sch-annual-hint" className="hint">
            {budget
              ? <>Filled in from the {budget.status === "approved" ? "approved" : "draft"} budget “{budget.name}”: {m(budget.cents)}. You can change it.</>
              : <>There is no budget for {year} yet, so please type the total.</>}
            {annualCents > 0 && totalCoef > 0 && sampleCoef > 0 && (
              <> A flat with a {sampleCoef.toFixed(2)}% share would pay about {m(Math.round((annualCents * sampleCoef) / totalCoef / f.periods))} per {f.per}.</>
            )}
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="sch-fixed">Amount each flat pays per {f.per} (€)</label>
          <input id="sch-fixed" name="fixed_amount" required inputMode="decimal" autoComplete="off" className="input tabular"
            value={fixed} onChange={(e) => setFixed(e.target.value)} aria-describedby="sch-fixed-hint" />
          <p id="sch-fixed-hint" className="hint">
            {fixedCents > 0
              ? <>That is {m(fixedCents * f.periods)} a year per flat, and {m(fixedCents * f.periods * unitCount)} a year for all {unitCount} flats.</>
              : <>For example 250 or 250,50.</>}
          </p>
        </div>
      )}

      <p className="hint">Saving the schedule does not charge anyone yet. You create the charges in the next step.</p>
      <button type="submit" disabled={pending} className="min-h-14 w-full rounded-xl bg-brand px-6 text-lg font-bold text-brand-ink hover:brightness-110 disabled:opacity-60 sm:w-fit">
        {pending ? "Saving…" : "Save the fee schedule"}
      </button>
    </form>
  );
}
