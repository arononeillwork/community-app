import clsx from "clsx";
import type { Tone } from "@/components/ui";

/*
 * How a budget category is doing, in the same words and colours everywhere it appears
 * (Finance overview, Budget page, and the residents' "Where the money goes" page):
 *   On track (ok) · Nearly used, 90% or more (warn) · Over budget (bad).
 * Spending in a category with no budget counts as over budget.
 */

export type BudgetState = "on_track" | "nearly" | "over" | "unbudgeted" | "unused";
export type BudgetStatus = { state: BudgetState; tone: Tone; word: string };

/** Share of the budget at which a category counts as nearly used. */
export const NEARLY_USED = 0.9;

export function budgetStatus(budget: number, actual: number): BudgetStatus {
  if (budget <= 0) {
    return actual > 0 ? { state: "unbudgeted", tone: "bad", word: "Not in the budget" } : { state: "unused", tone: "neutral", word: "No budget" };
  }
  if (actual > budget) return { state: "over", tone: "bad", word: "Over budget" };
  if (actual >= budget * NEARLY_USED) return { state: "nearly", tone: "warn", word: actual === budget ? "Fully used" : "Nearly used" };
  if (actual <= 0) return { state: "unused", tone: "neutral", word: "Nothing spent" };
  return { state: "on_track", tone: "ok", word: "On track" };
}

/** Worth pointing out with a badge: nearly used, over budget, or spending without a budget. */
export function needsAttention(s: BudgetStatus) {
  return s.tone === "warn" || s.tone === "bad";
}

const FILL: Partial<Record<Tone, string>> = { bad: "bg-bad", warn: "bg-warn" };

/**
 * A thin bar: how much of the budget is spent, coloured by budgetStatus().
 * `marker` (0–1) draws a tick, e.g. how much of the year has passed. Without a `label` the bar is hidden
 * from screen readers, for places where the numbers are written next to it.
 */
export function BudgetMeter({ budget, actual, marker, label, className }: {
  budget: number;
  actual: number;
  marker?: number | null;
  label?: string;
  className?: string;
}) {
  const status = budgetStatus(budget, actual);
  const pct = budget > 0 ? Math.min(100, (actual / budget) * 100) : actual > 0 ? 100 : 0;
  return (
    <div className={clsx("relative h-2 rounded-full bg-surface-2 ring-1 ring-inset ring-line", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <div className={clsx("h-full rounded-full", FILL[status.tone] ?? "bg-brand")} style={{ width: `${pct}%` }} />
      {marker != null && budget > 0 && (
        <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink/40"
          style={{ left: `calc(${Math.min(1, Math.max(0, marker)) * 100}% - 1px)` }} />
      )}
    </div>
  );
}
