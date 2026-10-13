import { Badge } from "@/components/ui";
import { BudgetMeter, budgetStatus, needsAttention } from "./BudgetStatus";

export type BudgetRow = { key: string; name: string; budget: number; actual: number };

/**
 * Budget against actual, one row per category. The thin tick marks an even spend for the year so far,
 * so a bar past the tick is spending faster than planned. Nearly used and over budget are shown in words as well as colour,
 * with the same words and colours as the Budget page (see BudgetStatus).
 */
export default function BudgetBars({ rows, yearShare, currency = "EUR" }: { rows: BudgetRow[]; yearShare: number; currency?: string }) {
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <div>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => {
          const status = budgetStatus(r.budget, r.actual);
          return (
            <li key={r.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                  {r.name}
                  {needsAttention(status) && <Badge tone={status.tone}>{status.word}</Badge>}
                </span>
                <span className="text-[0.9375rem] tabular text-ink-2">
                  {fmt.format(r.actual / 100)}
                  {r.budget > 0 && <span className="text-muted"> of {fmt.format(r.budget / 100)}</span>}
                </span>
              </div>
              <BudgetMeter className="mt-1.5" budget={r.budget} actual={r.actual} marker={yearShare}
                label={`${r.name}: ${fmt.format(r.actual / 100)} spent${r.budget > 0 ? ` of a ${fmt.format(r.budget / 100)} budget` : ", no budget set"}. ${status.word}.`} />
            </li>
          );
        })}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden className="inline-block h-3.5 w-0.5 rounded-full bg-ink/40" />
        Even spending for the year so far
      </p>
    </div>
  );
}
