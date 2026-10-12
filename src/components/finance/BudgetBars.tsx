import clsx from "clsx";
import { Badge } from "@/components/ui";

export type BudgetRow = { key: string; name: string; budget: number; actual: number };

/**
 * Budget against actual, one row per category. The thin tick marks an even spend for the year so far,
 * so a bar past the tick is spending faster than planned. Over budget is shown in words as well as colour.
 */
export default function BudgetBars({ rows, yearShare, currency = "EUR" }: { rows: BudgetRow[]; yearShare: number; currency?: string }) {
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <div>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => {
          const over = r.budget > 0 ? r.actual > r.budget : r.actual > 0;
          const pct = r.budget > 0 ? Math.min(1, r.actual / r.budget) : over ? 1 : 0;
          return (
            <li key={r.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 font-medium text-ink">
                  {r.name}
                  {over && <Badge tone="warn">{r.budget > 0 ? "Over budget" : "No budget"}</Badge>}
                </span>
                <span className="text-[0.9375rem] tabular text-ink-2">
                  {fmt.format(r.actual / 100)}
                  {r.budget > 0 && <span className="text-muted"> of {fmt.format(r.budget / 100)}</span>}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-surface-2 ring-1 ring-inset ring-line"
                role="meter" aria-valuemin={0} aria-valuemax={Math.max(r.budget, r.actual)} aria-valuenow={r.actual}
                aria-label={`${r.name}: ${fmt.format(r.actual / 100)} spent${r.budget > 0 ? ` of a ${fmt.format(r.budget / 100)} budget` : ", no budget set"}`}>
                <div className={clsx("h-full rounded-full", over ? "bg-warn" : "bg-brand")} style={{ width: `${pct * 100}%` }} />
                {r.budget > 0 && (
                  <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink/35" style={{ left: `calc(${yearShare * 100}% - 1px)` }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden className="inline-block h-3.5 w-0.5 rounded-full bg-ink/35" />
        Even spending for the year so far
      </p>
    </div>
  );
}
