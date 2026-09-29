"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Card, Notice } from "@/components/ui";
import { money, parseEurosToCents } from "@/lib/format";
import { valueGetter, type FormAction } from "./form";
import SubmitButton from "./SubmitButton";
import { btn } from "./styles";

export type BudgetCategory = {
  id: string;
  name: string;
  color: string;
  /** Pre-filled amount ("" = not in the budget). */
  amount: string;
  /** Last year's budget and spending for this category, for reference. */
  lastBudgetCents: number | null;
  lastSpentCents: number | null;
};

export default function BudgetForm({
  action, year, name, status, approvedAt, categories, cancelHref, currency = "EUR",
}: {
  action: FormAction;
  year: number;
  name: string;
  status: string;
  approvedAt: string;
  categories: BudgetCategory[];
  cancelHref: string;
  currency?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const initial: Record<string, string> = { name, status, approved_at: approvedAt };
  for (const c of categories) initial[`amount_${c.id}`] = c.amount;
  const v = valueGetter(state, initial);

  // Live total (display only).
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, v(`amount_${c.id}`)])));
  const [st, setSt] = useState(v("status"));
  const total = Object.values(amounts).reduce((sum, a) => sum + Math.max(0, parseEurosToCents(a) ?? 0), 0);

  return (
    <form key={state?.stamp ?? "initial"} action={formAction} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. About this budget</h2>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" className="input" maxLength={120} defaultValue={v("name")} placeholder={`Budget ${year}`} />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold">Status</legend>
          {[
            { value: "draft", title: "Draft", text: "The numbers are still being worked on." },
            { value: "approved", title: "Approved", text: "The owners agreed these numbers, usually at the yearly owners' meeting (AGM)." },
          ].map((o) => (
            <label key={o.value} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4", st === o.value ? "border-brand bg-brand-soft" : "border-line")}>
              <input type="radio" name="status" value={o.value} defaultChecked={v("status") === o.value} onChange={() => setSt(o.value)}
                className="mt-1 size-6 accent-[var(--brand)]" />
              <span><span className="block font-bold">{o.title}</span><span className="text-muted">{o.text}</span></span>
            </label>
          ))}
        </fieldset>
        {st === "approved" && (
          <div className="field">
            <label htmlFor="approved_at">Date it was approved</label>
            <input id="approved_at" name="approved_at" type="date" className="input sm:max-w-xs" defaultValue={v("approved_at")} aria-describedby="approved_hint" />
            <p id="approved_hint" className="hint">Leave empty to use today&apos;s date.</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Amount for each type of cost</h2>
        <p className="text-muted">
          Enter how much the community plans to spend in {year}, in euros, including VAT (tax), because invoices are counted with VAT.
          Leave a box empty if that type of cost is not part of the budget.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_16rem] sm:items-center">
              <div>
                <label htmlFor={`amount_${c.id}`} className="flex items-center gap-2 text-lg font-bold">
                  <span aria-hidden className="inline-block size-4 rounded-full border border-line-strong" style={{ background: c.color }} />
                  {c.name}
                </label>
                {(c.lastBudgetCents != null || c.lastSpentCents != null) && (
                  <p id={`last_${c.id}`} className="hint">
                    Last year: budget {c.lastBudgetCents != null ? money(c.lastBudgetCents, currency) : "none"}
                    {c.lastSpentCents != null && <>, spent {money(c.lastSpentCents, currency)}</>}
                  </p>
                )}
              </div>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted">€</span>
                <input id={`amount_${c.id}`} name={`amount_${c.id}`} inputMode="decimal" className="input tabular pl-8 text-right"
                  defaultValue={v(`amount_${c.id}`)} placeholder="Not in budget"
                  aria-describedby={c.lastBudgetCents != null || c.lastSpentCents != null ? `last_${c.id}` : undefined}
                  onChange={(e) => { const val = e.target.value; setAmounts((a) => ({ ...a, [c.id]: val })); }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="flex justify-between rounded-xl bg-brand-soft p-4 text-lg font-bold" aria-live="polite">
          <span>Total budget</span><span className="tabular">{money(total, currency)}</span>
        </p>
      </Card>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save budget</SubmitButton>
        <Link href={cancelHref} className={btn("secondary", "lg")}>Cancel</Link>
      </div>
    </form>
  );
}
