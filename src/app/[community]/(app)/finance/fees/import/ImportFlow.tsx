"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { Badge, Card, Notice } from "@/components/ui";
import { date, money } from "@/lib/format";
import { plural } from "@/components/finance/fees/utils";
import { useFormAction } from "@/components/finance/fees/useFormAction";
import { confirmImport, parseStatement, type ConfirmState, type PreviewRow } from "../actions";

type Unit = { id: string; label: string };

export default function ImportFlow({ slug, units, currency }: { slug: string; units: Unit[]; currency: string }) {
  const [parsed, onParse, parsing] = useFormAction(parseStatement.bind(null, slug));
  const [done, onConfirm, confirming] = useFormAction(confirmImport.bind(null, slug));
  const preview = parsed?.preview;
  const finished = !!(done?.ok && preview && done.ok.parseId === preview.parseId);
  const m = (c: number) => money(c, currency);

  return (
    <div className="flex flex-col gap-6">
      <Card className="no-print flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. Choose the file</h2>
        <form onSubmit={onParse} className="flex flex-col gap-4">
          {parsed?.error && <Notice tone="bad">{parsed.error}</Notice>}
          <div className="field">
            <label htmlFor="csv-file">Bank statement file (CSV)</label>
            <input id="csv-file" name="file" type="file" required accept=".csv,.txt,text/csv,text/plain"
              className="input file:mr-4 file:min-h-10 file:rounded-lg file:border-0 file:bg-brand-soft file:px-4 file:font-bold file:text-ink"
              aria-describedby="csv-file-hint" />
            <p id="csv-file-hint" className="hint">Up to 1 MB and 500 rows. Nothing is saved until you confirm in step 2.</p>
          </div>
          <button type="submit" disabled={parsing}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-lg font-bold text-brand-ink hover:brightness-110 disabled:opacity-60 sm:w-fit">
            <FileUp aria-hidden className="size-5" /> {parsing ? "Reading the file…" : "Read the file"}
          </button>
        </form>
      </Card>

      {finished && done?.ok && (
        <Notice tone="ok">
          <p>
            {done.ok.recorded === 0
              ? "No new payments were recorded."
              : `Done: ${plural(done.ok.recorded, "payment")} recorded, ${m(done.ok.totalCents)} in total.`}
          </p>
          {done.ok.skipped > 0 && (
            <p className="font-normal">{plural(done.ok.skipped, "payment was", "payments were")} already recorded, so {done.ok.skipped === 1 ? "it was" : "they were"} skipped.</p>
          )}
          <p className="mt-2 font-normal">
            <Link href={`/${slug}/finance/fees`} className="font-bold text-brand underline">Go back to Owner fees</Link>
            {" "}or choose another file above.
          </p>
        </Notice>
      )}

      {preview && !finished && (
        <Preview key={preview.parseId} preview={preview} units={units} currency={currency}
          onConfirm={onConfirm} confirming={confirming} error={done?.error} />
      )}
    </div>
  );
}

function Preview({ preview, units, currency, onConfirm, confirming, error }: {
  preview: { parseId: string; fileName: string; rows: PreviewRow[] };
  units: Unit[];
  currency: string;
  onConfirm: (e: FormEvent<HTMLFormElement>) => void;
  confirming: boolean;
  error: NonNullable<ConfirmState>["error"];
}) {
  const labels = useMemo(() => new Map(units.map((u) => [u.id, u.label])), [units]);
  const rows = preview.rows;
  const usable = rows.filter((r) => !r.problem);
  // Chosen flat per row ("" = do not record). Matched rows start ticked unless they look already recorded.
  const [choice, setChoice] = useState<Record<number, string>>(() =>
    Object.fromEntries(usable.map((r) => [r.line, r.unit_id && !r.duplicate ? r.unit_id : ""])));
  const m = (c: number) => money(c, currency);

  const selected = usable.filter((r) => choice[r.line]);
  const total = selected.reduce((t, r) => t + (r.amount_cents ?? 0), 0);
  const matched = usable.filter((r) => r.unit_id).length;
  const hidden = JSON.stringify(usable.map((r) => ({
    line: r.line, date: r.date, description: r.description, amount_cents: r.amount_cents, unit_id: r.unit_id, duplicate: r.duplicate,
  })));

  const cell = "flex flex-wrap gap-x-2 py-1 md:table-cell md:px-3 md:py-3 md:align-top";
  const tag = "font-bold text-muted md:hidden";

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">2. Check the payments</h2>
      <p>
        <strong>{preview.fileName}</strong>: {plural(rows.length, "row")} read.{" "}
        {plural(matched, "payment")} matched to a flat, {plural(usable.length - matched, "payment")} {usable.length - matched === 1 ? "needs" : "need"} a flat chosen
        {rows.length > usable.length && <>, {plural(rows.length - usable.length, "row")} will not be imported</>}.
      </p>
      <p className="text-muted">
        Ticked payments will be recorded. For a payment without a match, choose the flat it belongs to, or leave “Do not record”.
      </p>

      <form onSubmit={onConfirm} className="flex flex-col gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <input type="hidden" name="parseId" value={preview.parseId} />
        <input type="hidden" name="rows" value={hidden} />

        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Payments found in the file</caption>
          <thead className="hidden border-b-2 border-line-strong md:table-header-group">
            <tr>
              <th scope="col" className="px-3 py-3">Row</th>
              <th scope="col" className="px-3 py-3">Date</th>
              <th scope="col" className="px-3 py-3">Description</th>
              <th scope="col" className="px-3 py-3 text-right">Amount</th>
              <th scope="col" className="px-3 py-3">Flat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = !!choice[r.line];
              return (
                <tr key={r.line} className={`mb-3 block rounded-xl border border-line p-3 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:p-0 ${r.problem ? "text-muted" : on ? "bg-ok-soft/40" : ""}`}>
                  <td className={cell}><span className={tag}>Row</span>{r.line}</td>
                  <td className={`${cell} whitespace-nowrap`}><span className={tag}>Date</span>{r.date ? date(r.date) : r.rawDate || "—"}</td>
                  <td className={`${cell} break-words`}><span className={tag}>Description</span>{r.description || "—"}</td>
                  <td className={`${cell} tabular whitespace-nowrap md:text-right`}>
                    <span className={tag}>Amount</span>{r.amount_cents != null ? m(r.amount_cents) : r.rawAmount || "—"}
                  </td>
                  <td className={`${cell} md:min-w-[16rem]`}>
                    <span className={tag}>Flat</span>
                    {r.problem ? (
                      <span>Not imported: {r.problem.charAt(0).toLowerCase() + r.problem.slice(1)}</span>
                    ) : r.unit_id ? (
                      <div className="flex flex-col gap-1">
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 font-bold">
                          <input type="checkbox" name={`use_${r.line}`} checked={on} className="size-6 shrink-0 accent-[var(--brand)]"
                            onChange={(e) => setChoice((c) => ({ ...c, [r.line]: e.target.checked ? r.unit_id! : "" }))} />
                          Record for flat {labels.get(r.unit_id) ?? "?"}
                        </label>
                        {r.reason && <span className="hint">Matched by: {r.reason.charAt(0).toLowerCase() + r.reason.slice(1)}</span>}
                        {r.duplicate && <span><Badge tone="warn">Already recorded?</Badge> <span className="hint">A payment with the same date, amount and description exists.</span></span>}
                      </div>
                    ) : (
                      <div className="flex w-full flex-col gap-1">
                        <label htmlFor={`unit_${r.line}`} className="font-bold">
                          <span className="md:hidden">Which flat?</span>
                          <span className="hidden md:inline">No match. Which flat?</span>
                        </label>
                        <select id={`unit_${r.line}`} name={`unit_${r.line}`} className="input" value={choice[r.line] ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [r.line]: e.target.value }))}>
                          <option value="">Do not record</option>
                          {r.candidates.length > 0 && (
                            <optgroup label="Possible matches">
                              {r.candidates.map((id) => <option key={`c-${id}`} value={id}>{labels.get(id) ?? id}</option>)}
                            </optgroup>
                          )}
                          <optgroup label="All flats">
                            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                          </optgroup>
                        </select>
                        {r.reason && <span className="hint">{r.reason}{r.candidates.length > 0 && `: ${r.candidates.map((id) => labels.get(id) ?? "?").join(", ")}`}</span>}
                        {r.duplicate && <span><Badge tone="warn">Already recorded?</Badge> <span className="hint">A payment with the same date, amount and description exists.</span></span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-brand-soft p-4">
          <p className="text-lg font-bold" aria-live="polite">
            {selected.length === 0 ? "No payments selected yet." : `${plural(selected.length, "payment")} will be recorded, ${m(total)} in total.`}
          </p>
          <p className="hint">Each payment is recorded as a bank transfer, with the bank description as its reference. It pays off the flat’s oldest unpaid fees first.</p>
          <button type="submit" disabled={confirming || selected.length === 0}
            className="min-h-14 w-full rounded-xl bg-brand px-6 text-lg font-bold text-brand-ink hover:brightness-110 disabled:opacity-60 sm:w-fit">
            {confirming ? "Recording…" : selected.length === 0 ? "Record payments" : `Yes, record ${plural(selected.length, "payment")}`}
          </button>
        </div>
      </form>
    </Card>
  );
}
