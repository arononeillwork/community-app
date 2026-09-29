import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { moneyShort } from "@/lib/format";
import { Badge } from "@/components/ui";

export type BudgetBarRow = { name: string; budget: number | null; actual: number };

/**
 * Budget vs spending per category, as plain HTML/CSS bars.
 * Every row says everything in words; the bar itself is decorative (aria-hidden).
 * Full bar = the whole year's budget for that category. The thin dark line marks how far through the year we are,
 * so a bar that is well past the line is spending faster than planned.
 */
export default function BudgetBars({ rows, currency, yearProgressPct }: { rows: BudgetBarRow[]; currency: string; yearProgressPct: number }) {
  const m = (c: number) => moneyShort(c, currency);
  return (
    <ul className="flex flex-col gap-6">
      {rows.map((r) => {
        const hasBudget = r.budget != null && r.budget > 0;
        const over = hasBudget ? r.actual > (r.budget as number) : r.actual > 0 && r.budget != null;
        const pct = hasBudget ? Math.round((r.actual / (r.budget as number)) * 100) : null;
        const width = hasBudget ? Math.min(100, (r.actual / (r.budget as number)) * 100) : r.actual > 0 ? 100 : 0;
        const ahead = hasBudget && !over && pct != null && pct > yearProgressPct + 10;

        return (
          <li key={r.name}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-lg font-bold">{r.name}</span>
              {over && (
                <Badge tone="bad"><AlertTriangle aria-hidden className="mr-1 size-4" /> Over budget</Badge>
              )}
              {!over && ahead && <Badge tone="warn">Spending faster than planned</Badge>}
              {!hasBudget && r.budget == null && <Badge tone="neutral">No budget set</Badge>}
            </div>
            <div aria-hidden className={clsx("relative mt-2 h-5 w-full rounded border", over ? "border-bad/40 bg-bad-soft" : "border-line bg-brand-soft")}>
              <div className={clsx("h-full rounded-r", over ? "bg-bad" : r.budget == null ? "bg-line-strong" : "bg-brand")} style={{ width: `${width}%` }} />
              {hasBudget && (
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${Math.min(100, Math.max(0, yearProgressPct))}%` }} />
              )}
            </div>
            <p className="tabular mt-1">
              {hasBudget ? (
                <>
                  {m(r.actual)} spent of {m(r.budget as number)} budget ({pct}%).{" "}
                  {over
                    ? <span className="font-bold text-bad">{m(r.actual - (r.budget as number))} more than planned.</span>
                    : <span className="text-muted">{m((r.budget as number) - r.actual)} left.</span>}
                </>
              ) : r.budget == null ? (
                <>{m(r.actual)} spent. There is no budget line for this category.</>
              ) : (
                <>{m(r.actual)} spent. The budget for this category is {m(0)}.</>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
