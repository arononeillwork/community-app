"use client";

import { useActionState, useState } from "react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { parseEurosToCents } from "@/lib/format";
import { saveBudgetLines, type BudgetFormState } from "./actions";

type Line = { category_id: string; name: string; color: string; amount: string; last_year: number | null; actual_last_year: number | null };

const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Amount per expense category for a draft budget, with a live total. */
export default function BudgetLinesForm({ slug, budgetId, year, lines, cancelHref }: {
  slug: string; budgetId: string; year: number; lines: Line[]; cancelHref: string;
}) {
  const [state, action, pending] = useActionState<BudgetFormState, FormData>(saveBudgetLines.bind(null, slug, budgetId), undefined);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.category_id, state?.values?.[`amount_${l.category_id}`] ?? l.amount])),
  );
  const total = Object.values(amounts).reduce((t, v) => t + (parseEurosToCents(v) ?? 0), 0);
  const hasHistory = lines.some((l) => l.last_year != null || l.actual_last_year != null);

  return (
    <form action={action}>
      <Card padded={false}>
        <div className="flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-3">
          <h3 className="text-[1.0625rem] font-semibold">Amounts for {year}</h3>
          <p className="text-[0.9375rem] text-muted">In euros, including VAT. Leave a category empty if it has no budget.</p>
        </div>
        {state?.error && <div className="px-5 pb-3 sm:px-6"><Notice tone="bad">{state.error}</Notice></div>}
        <ul className="divide-y divide-line border-t border-line">
          {lines.map((l) => (
            <li key={l.category_id} className="grid items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[1fr_12rem] sm:px-6">
              <div className="min-w-0">
                <label htmlFor={`amount_${l.category_id}`} className="flex items-center gap-2.5 font-medium text-ink">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </label>
                {hasHistory && (
                  <p className="pl-5 text-sm text-muted">
                    {l.last_year != null ? `${year - 1} budget ${fmt.format(l.last_year / 100)}` : `No ${year - 1} budget`}
                    {l.actual_last_year != null ? ` · spent ${fmt.format(l.actual_last_year / 100)}` : ""}
                  </p>
                )}
              </div>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">€</span>
                <input id={`amount_${l.category_id}`} name={`amount_${l.category_id}`} inputMode="decimal" className="input tabular pl-7 text-right"
                  value={amounts[l.category_id] ?? ""} placeholder="0.00"
                  onChange={(e) => setAmounts((a) => ({ ...a, [l.category_id]: e.target.value }))} />
              </div>
            </li>
          ))}
          <li className="grid items-center gap-x-4 bg-surface-2 px-5 py-3 sm:grid-cols-[1fr_12rem] sm:px-6">
            <span className="font-medium">Total</span>
            <span className="tabular text-right text-[1.125rem] font-semibold" aria-live="polite">{fmt.format(total / 100)}</span>
          </li>
        </ul>
      </Card>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : "Save budget"}</button>
      </div>
    </form>
  );
}
