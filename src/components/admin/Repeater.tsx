"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";

type Field = { name: string; label: string; type?: "text" | "tel" | "date" | "textarea"; placeholder?: string; maxLength?: number };

/**
 * Repeatable rows of inputs (opening hours, phone numbers, notices). Every input of a column shares
 * one name, so the server reads them with form.getAll(name) in row order.
 * "compact" rows sit on one line from tablet width up, with the labels shown once above the first row.
 */
export default function Repeater({ id, legend, hint, fields, initial, addLabel, empty, defaults = {}, compact = false }: {
  id: string;
  legend: ReactNode;
  hint?: string;
  fields: Field[];
  initial: Record<string, string>[];
  addLabel: string;
  empty: string;
  /** Values for a newly added row. */
  defaults?: Record<string, string>;
  compact?: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ key: i, values: r })));
  const [next, setNext] = useState(initial.length);

  const add = () => { setRows((r) => [...r, { key: next, values: defaults }]); setNext((n) => n + 1); };
  const remove = (key: number) => setRows((r) => r.filter((x) => x.key !== key));

  return (
    <fieldset className="min-w-0 flex flex-col gap-3">
      <legend className="mb-1 text-[1rem] font-semibold">{legend}</legend>
      {hint && <p className="-mt-2 text-sm text-muted">{hint}</p>}
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[0.9375rem] text-muted">{empty}</p>}
      <ul className={clsx("flex flex-col", compact ? "gap-3 sm:gap-2" : "gap-3")}>
        {rows.map((row, i) => (
          <li key={row.key} className={clsx("flex items-end gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line",
            compact && "sm:rounded-none sm:bg-transparent sm:p-0 sm:ring-0")}>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-3">
              {fields.map((f) => {
                const fid = `${id}-${f.name}-${row.key}`;
                const common = { id: fid, name: f.name, defaultValue: row.values[f.name] ?? "", placeholder: f.placeholder, maxLength: f.maxLength };
                return (
                  <div key={f.name} className={clsx("field", f.type === "textarea" && "sm:col-span-2")}>
                    <label htmlFor={fid} className={clsx("!text-sm !text-muted", compact && i > 0 && "sm:sr-only")}>
                      {f.label}{rows.length > 1 ? <span className="sr-only"> (row {i + 1})</span> : null}
                    </label>
                    {f.type === "textarea"
                      ? <textarea {...common} className="input !min-h-20" />
                      : <input {...common} type={f.type ?? "text"} className="input" />}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => remove(row.key)} title="Remove this row" aria-label={`Remove row ${i + 1}`}
              className={clsx("inline-grid size-11 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-bad-soft hover:text-bad",
                !compact && "self-start sm:mt-7")}>
              <Trash2 aria-hidden className="size-[1.1rem]" />
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={add}
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[0.9375rem] font-medium text-brand-text transition-colors hover:bg-brand-soft">
          <Plus aria-hidden className="size-4" /> {addLabel}
        </button>
      </div>
    </fieldset>
  );
}
