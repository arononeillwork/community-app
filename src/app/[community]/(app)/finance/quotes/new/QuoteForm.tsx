"use client";

import { useActionState, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { addQuote, type QuoteFormState } from "../actions";

export default function QuoteForm({ slug, jobs, job, suppliers, cancelHref }: {
  slug: string; jobs: string[]; job: string; suppliers: { id: string; name: string; service_type: string }[]; cancelHref: string;
}) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(addQuote.bind(null, slug), undefined);
  const [supplier, setSupplier] = useState(state?.values?.supplier_id ?? "");
  const v = (k: string, d = "") => state?.values?.[k] ?? d;

  return (
    <form action={action} key={state?.values ? JSON.stringify(state.values) : "initial"} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="job_title">Job</label>
          <input id="job_title" name="job_title" className="input" required maxLength={120} list="jobs" defaultValue={v("job_title", job)}
            placeholder="e.g. Roof waterproofing Block C" aria-describedby="job_hint" />
          <datalist id="jobs">{jobs.map((j) => <option key={j} value={j} />)}</datalist>
          <p id="job_hint" className="hint">Use the same job name for every quote you want to compare.</p>
        </div>
        <div className="field">
          <label htmlFor="supplier_id">Supplier</label>
          <select id="supplier_id" name="supplier_id" className="input" required value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="" disabled>Choose a supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.service_type}</option>)}
            <option value="other">Another company…</option>
          </select>
        </div>
        {supplier === "other" && (
          <div className="field">
            <label htmlFor="supplier_name">Company name</label>
            <input id="supplier_name" name="supplier_name" className="input" required maxLength={120} defaultValue={v("supplier_name")} placeholder="e.g. Cubiertas Andalucía" />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="amount">Price quoted (€)</label>
            <input id="amount" name="amount" inputMode="decimal" className="input tabular" required defaultValue={v("amount")} placeholder="3920.40" aria-describedby="amount_hint" />
            <p id="amount_hint" className="hint">The total price on the quote.</p>
          </div>
          <div className="field">
            <label htmlFor="valid_until">Valid until <span className="font-normal text-muted">(optional)</span></label>
            <input id="valid_until" name="valid_until" type="date" className="input" defaultValue={v("valid_until")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">Notes <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="notes" name="notes" className="input min-h-20" maxLength={1000} defaultValue={v("notes")} placeholder="e.g. Includes a 10-year guarantee. Can start in March." />
        </div>
        <div className="field">
          <label htmlFor="file">Quote document <span className="font-normal text-muted">(optional)</span></label>
          <div className="relative">
            <Paperclip aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input id="file" name="file" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="input pl-9 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-text" />
          </div>
          <p className="hint">PDF, photo, Word or Excel, up to 20 MB.</p>
        </div>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : "Add quote"}</button>
      </div>
    </form>
  );
}
