import clsx from "clsx";
import { money, moneyShort } from "@/lib/format";

export type MonthPoint = {
  key: string;      // "2026-09"
  label: string;    // "September 2026"
  short: string;    // "Sep"
  total: number;    // cents
  count: number;    // number of invoices
  current: boolean; // this month (still running)
};

/** Round up to a clean axis maximum: 1, 2, 2.5, 5 × 10^n (in cents, on whole euros). */
function niceMax(cents: number) {
  if (cents <= 0) return 100000;
  const euros = cents / 100;
  const mag = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= euros) ?? 10;
  return step * mag * 100;
}

/**
 * Spending per month as a simple column chart in HTML/CSS.
 * The chart is one image for screen readers (with a summary); the exact figures are in the "Show as table" section.
 * Each column has a hover title too, and the highest month and this month carry their value on the cap.
 */
export default function MonthlySpendChart({ months, currency }: { months: MonthPoint[]; currency: string }) {
  const max = Math.max(0, ...months.map((m) => m.total));
  const top = niceMax(max);
  const ticks = [top, top / 2, 0];
  const highest = months.reduce<MonthPoint | null>((best, m) => (m.total > 0 && (!best || m.total > best.total) ? m : best), null);
  const sum = months.reduce((s, m) => s + m.total, 0);
  const count = months.reduce((s, m) => s + m.count, 0);
  const first = months[0];
  const last = months[months.length - 1];

  const summary = months.length === 0 ? "No spending to show." :
    `Spending per month from ${first.label} to ${last.label}. Total ${moneyShort(sum, currency)}.` +
    (highest ? ` The highest month was ${highest.label} with ${moneyShort(highest.total, currency)}.` : " No invoices in this period.");

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label="Column chart of spending per month. The figures are in the caption and in the table below." className="flex flex-col gap-1">
        <div className="relative mt-6 h-60 w-full">
          {/* Gridlines with clean values */}
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute left-0 right-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="tabular absolute left-0 -translate-y-1/2 bg-surface pr-1 text-sm text-muted">{moneyShort(t, currency)}</span>
            </div>
          ))}
          {/* Columns */}
          <div className="absolute inset-y-0 left-16 right-0 flex items-end gap-0.5 sm:left-20">
            {months.map((m) => {
              const h = top > 0 ? (m.total / top) * 100 : 0;
              const labelled = m.total > 0 && (m === highest || m.current);
              return (
                <div key={m.key} title={`${m.label}${m.current ? " (so far)" : ""}: ${money(m.total, currency)}`}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  {labelled && (
                    <span className="tabular mb-1 hidden shrink-0 whitespace-nowrap bg-surface px-0.5 text-xs font-bold text-ink sm:block">
                      {moneyShort(m.total, currency)}
                    </span>
                  )}
                  <div
                    className={clsx("w-full max-w-6 shrink-0 rounded-t-[4px]", m.current ? "bg-brand/55" : "bg-brand", m.total > 0 && "min-h-[2px]")}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {/* Month labels, aligned with the columns */}
        <div aria-hidden className="flex gap-0.5 pl-16 sm:pl-20">
          {months.map((m) => (
            <div key={m.key} className={clsx("min-w-0 flex-1 text-center text-sm", m.current ? "font-bold text-ink" : "text-muted")}>
              <span className="sm:hidden">{m.short.slice(0, 1)}</span>
              <span className="hidden sm:inline">{m.short}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-muted">
        {summary} {months.some((m) => m.current) && "The lighter column is this month so far."} Disputed invoices are not counted.
      </figcaption>

      <details className="rounded-xl border border-line bg-bg p-3">
        <summary className="min-h-12 cursor-pointer content-center font-bold text-brand">Show as table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Spending per month</caption>
            <thead>
              <tr className="border-b-2 border-line-strong">
                <th scope="col" className="px-3 py-2">Month</th>
                <th scope="col" className="px-3 py-2 text-right">Invoices</th>
                <th scope="col" className="px-3 py-2 text-right">Spent</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-b border-line">
                  <th scope="row" className="px-3 py-2 font-normal">{m.label}{m.current && " (so far)"}</th>
                  <td className="tabular px-3 py-2 text-right">{m.count}</td>
                  <td className="tabular px-3 py-2 text-right">{money(m.total, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong font-bold">
                <th scope="row" className="px-3 py-2">Total</th>
                <td className="tabular px-3 py-2 text-right">{count}</td>
                <td className="tabular px-3 py-2 text-right">{money(sum, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </figure>
  );
}
