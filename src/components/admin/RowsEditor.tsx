"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { btn } from "./styles";

export type RowField = {
  key: string;
  label: string;
  type?: "text" | "tel" | "date" | "textarea";
  placeholder?: string;
  maxLength?: number;
};

type Row = { _id: string } & Record<string, string>;

/**
 * Edit a short list of rows (opening hours, phone numbers, notices).
 * The rows are sent to the server as JSON in one hidden input called `name`.
 * Nothing is saved until the surrounding form is submitted.
 */
export default function RowsEditor({ name, legend, intro, itemLabel, fields, initial, addLabel, newRow, empty }: {
  name: string;
  legend: string;
  intro?: string;
  itemLabel: string;
  fields: RowField[];
  initial: Record<string, string>[];
  addLabel: string;
  newRow?: Record<string, string>;
  empty: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((r, i) => ({ _id: `r${i}`, ...Object.fromEntries(fields.map((f) => [f.key, String(r[f.key] ?? "")])) })));
  const counter = useRef(0);
  const focusId = useRef<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  // Put the cursor in the first box of a newly added row.
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
  }, [rows]);

  function add() {
    const id = `n${counter.current++}`;
    focusId.current = `${name}-${id}-${fields[0].key}`;
    setRows((rs) => [...rs, { _id: id, ...Object.fromEntries(fields.map((f) => [f.key, newRow?.[f.key] ?? ""])) }]);
  }

  function remove(id: string) {
    setRows((rs) => rs.filter((r) => r._id !== id));
    addRef.current?.focus();
  }

  function change(id: string, key: string, value: string) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, [key]: value } : r)));
  }

  const json = JSON.stringify(rows.map((r) => Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? ""]))));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xl font-bold">{legend}</legend>
      {intro && <p className="hint -mt-1">{intro}</p>}
      <input type="hidden" name={name} value={json} />

      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-line p-4 text-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r._id} className="flex flex-col gap-3 rounded-xl border-2 border-line bg-bg p-4">
              <p className="font-bold">{itemLabel} {i + 1}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const id = `${name}-${r._id}-${f.key}`;
                  return (
                    <div key={f.key} className={f.type === "textarea" ? "field sm:col-span-2" : "field"}>
                      <label htmlFor={id}>{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea id={id} value={r[f.key] ?? ""} maxLength={f.maxLength} placeholder={f.placeholder} className="input"
                          onChange={(e) => change(r._id, f.key, e.target.value)} />
                      ) : (
                        <input id={id} type={f.type ?? "text"} value={r[f.key] ?? ""} maxLength={f.maxLength} placeholder={f.placeholder}
                          className="input" onChange={(e) => change(r._id, f.key, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => remove(r._id)} className={btn("secondary", "md", "w-fit border-bad text-bad")}>
                <Trash2 aria-hidden className="size-5" /> Remove {itemLabel.toLowerCase()} {i + 1}
              </button>
            </li>
          ))}
        </ol>
      )}

      <button ref={addRef} type="button" onClick={add} className={btn("secondary", "md", "w-fit")}>
        <Plus aria-hidden className="size-5" /> {addLabel}
      </button>
    </fieldset>
  );
}
