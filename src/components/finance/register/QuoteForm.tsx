"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { FileText } from "lucide-react";
import { Card, Notice } from "@/components/ui";
import { FILE_ACCEPT, MAX_FILE_MB, valueGetter, type FormAction } from "./form";
import SubmitButton from "./SubmitButton";
import { btn } from "./styles";

export default function QuoteForm({
  action, jobs, suppliers, initialJob, cancelHref,
}: {
  action: FormAction;
  jobs: string[];
  suppliers: { id: string; name: string }[];
  initialJob: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const v = valueGetter(state, {
    job_title: initialJob, supplier_mode: suppliers.length ? "list" : "other", supplier_id: "", supplier_name: "",
    amount: "", valid_until: "", notes: "",
  });
  const [mode, setMode] = useState(v("supplier_mode"));

  return (
    <form key={state?.stamp ?? "initial"} action={formAction} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. Which job is it for?</h2>
        <div className="field">
          <label htmlFor="job_title">Job</label>
          <input id="job_title" name="job_title" className="input" required maxLength={200} list="job-list" defaultValue={v("job_title")}
            placeholder="e.g. Roof repair Block C" aria-describedby="job_hint" />
          <datalist id="job-list">
            {jobs.map((j) => <option key={j} value={j} />)}
          </datalist>
          <p id="job_hint" className="hint">
            To compare quotes, use exactly the same job name for each one. Tap the box to pick a job you already have, or type a new one.
          </p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Which company gave the quote?</h2>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Company</legend>
          {[
            { value: "list", title: "One of our suppliers", disabled: suppliers.length === 0 },
            { value: "other", title: "A different company", disabled: false },
          ].map((o) => (
            <label key={o.value} className={clsx("flex items-center gap-3 rounded-xl border-2 p-4 font-bold",
              o.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", mode === o.value ? "border-brand bg-brand-soft" : "border-line")}>
              <input type="radio" name="supplier_mode" value={o.value} disabled={o.disabled} defaultChecked={v("supplier_mode") === o.value}
                onChange={() => setMode(o.value)} className="size-6 accent-[var(--brand)]" />
              {o.title}{o.disabled && <span className="font-normal text-muted"> (none yet)</span>}
            </label>
          ))}
        </fieldset>
        {mode === "list" ? (
          <div className="field">
            <label htmlFor="supplier_id">Supplier</label>
            <select id="supplier_id" name="supplier_id" className="input" required defaultValue={v("supplier_id")}>
              <option value="">Choose a supplier</option>
              {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="supplier_name">Company name</label>
            <input id="supplier_name" name="supplier_name" className="input" required maxLength={200} defaultValue={v("supplier_name")} />
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Price and details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="amount">Price in euros</label>
            <input id="amount" name="amount" inputMode="decimal" className="input tabular" required defaultValue={v("amount")}
              placeholder="e.g. 3.920,40" aria-describedby="amount_hint" />
            <p id="amount_hint" className="hint">The total price written on the quote. Use the same basis (with or without VAT) for every quote of a job.</p>
          </div>
          <div className="field">
            <label htmlFor="valid_until">Valid until <span className="font-normal text-muted">(optional)</span></label>
            <input id="valid_until" name="valid_until" type="date" className="input" defaultValue={v("valid_until")} aria-describedby="valid_hint" />
            <p id="valid_hint" className="hint">The last day the company promises this price.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">Notes <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="notes" name="notes" className="input" maxLength={4000} defaultValue={v("notes")}
            placeholder="e.g. Includes 10-year guarantee. Can start in 2 weeks." />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">4. The quote document <span className="font-normal text-muted">(optional)</span></h2>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-5 text-center font-bold hover:border-brand">
          <FileText aria-hidden className="size-10 text-brand" />
          Choose the quote (PDF or photo)
          <input type="file" name="file" accept={FILE_ACCEPT} className="w-full max-w-sm text-base font-normal" />
        </label>
        <p className="hint">Up to {MAX_FILE_MB} MB. Only finance users can open it.</p>
        {state?.error && <p className="hint">If you had chosen a file, please choose it again.</p>}
      </Card>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save quote</SubmitButton>
        <Link href={cancelHref} className={btn("secondary", "lg")}>Cancel</Link>
      </div>
    </form>
  );
}
