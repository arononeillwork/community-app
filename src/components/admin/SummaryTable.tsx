import type { ReactNode } from "react";
import clsx from "clsx";

export type SummaryColumn = { key: string; header: string; numeric?: boolean };
export type SummaryRow = { key: string; cells: Record<string, ReactNode> };

/**
 * A small, plain, accessible summary table (caption, row + column headers, totals row).
 * Used for short tallies where the full DataTable toolbar would be noise.
 */
export default function SummaryTable({ caption, intro, columns, rows, totals, empty = "Nothing to count yet." }: {
  caption: string;
  intro?: ReactNode;
  columns: SummaryColumn[];
  rows: SummaryRow[];
  totals?: Record<string, ReactNode>;
  empty?: string;
}) {
  return (
    <div className="card flex flex-col gap-2 rounded-card border border-line bg-surface p-4 sm:p-5">
      <table className="w-full border-collapse text-left">
        <caption className="mb-2 text-left">
          <span className="block text-xl font-bold">{caption}</span>
          {intro && <span className="block text-base text-muted">{intro}</span>}
        </caption>
        <thead>
          <tr className="border-b-2 border-line-strong">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={clsx("px-2 py-2 text-base font-bold", c.numeric && "text-right")}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-2 py-4 text-muted">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key} className="border-b border-line">
              {columns.map((c, i) => {
                const cls = clsx("px-2 py-2 align-top", c.numeric && "tabular text-right");
                return i === 0
                  ? <th key={c.key} scope="row" className={clsx(cls, "font-bold")}>{r.cells[c.key]}</th>
                  : <td key={c.key} className={cls}>{r.cells[c.key]}</td>;
              })}
            </tr>
          ))}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-brand-soft font-bold">
              {columns.map((c, i) => i === 0
                ? <th key={c.key} scope="row" className="px-2 py-2">Total</th>
                : <td key={c.key} className={clsx("px-2 py-2", c.numeric && "tabular text-right")}>{totals[c.key] ?? ""}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
