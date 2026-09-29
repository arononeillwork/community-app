import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { moneyShort } from "@/lib/format";
import { Badge } from "@/components/ui";

export type SpendRow = { name: string; budget: number; actual: number };

/**
 * Accessible horizontal bars in plain HTML/CSS. Each row says everything in words
 * ("€X spent of €Y budget (Z%)"); the bar itself is decorative (aria-hidden).
 * With a budget: the bar is the share of that category's budget used (full = 100 %).
 * Without any budget (e.g. a past year with no budget entered): bars compare spending between categories.
 */
export default function SpendBars({ rows, currency, hasBudget }: { rows: SpendRow[]; currency: string; hasBudget: boolean }) {
  const maxActual = Math.max(1, ...rows.map((r) => r.actual));

  return (
    <ul className="flex flex-col gap-6">
      {rows.map((r) => {
        const over = hasBudget && r.actual > r.budget;
        const pct = r.budget > 0 ? Math.round((r.actual / r.budget) * 100) : null;
        const width = !hasBudget
          ? (r.actual / maxActual) * 100
          : r.budget > 0 ? Math.min(100, (r.actual / r.budget) * 100) : r.actual > 0 ? 100 : 0;

        let words: string;
        if (!hasBudget) words = `${moneyShort(r.actual, currency)} spent`;
        else if (r.budget > 0) words = `${moneyShort(r.actual, currency)} spent of ${moneyShort(r.budget, currency)} budget (${pct}%)`;
        else words = `${moneyShort(r.actual, currency)} spent, but no budget was set for this`;

        return (
          <li key={r.name}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-lg font-bold">{r.name}</span>
              {over && (
                <Badge tone="bad">
                  <AlertTriangle aria-hidden className="mr-1 size-4" /> Over budget
                </Badge>
              )}
            </div>
            <div aria-hidden className={clsx("mt-2 h-5 w-full overflow-hidden rounded border", over ? "border-bad/40 bg-bad-soft" : "border-line bg-brand-soft")}>
              <div className={clsx("h-full rounded", over ? "bg-bad" : "bg-brand")} style={{ width: `${width}%` }} />
            </div>
            <p className="tabular mt-1">
              {words}
              {over && r.budget > 0 && <>. <span className="font-bold text-bad">{moneyShort(r.actual - r.budget, currency)} more than planned.</span></>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
