"use client";

import { useActionState, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { parseEurosToCents } from "@/lib/format";
import { FREQUENCIES } from "@/components/finance-ops/dates";
import { saveContract, type ContractFormState } from "./actions";

type Opt = { id: string; name: string; service_type?: string };

export type ContractInitial = {
  supplier_id: string;
  new_supplier_name: string;
  new_supplier_service: string;
  title: string;
  category_id: string;
  start_date: string;
  end_date: string;
  notice_period_days: string;
  auto_renew: boolean;
  billing_frequency: string;
  amount: string;
  vat_rate: string;
  price_review_clause: string;
  notes: string;
};

const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function ContractForm({ slug, contractId, initial, suppliers, categories, currentFile, cancelHref, submitLabel, quoteId }: {
  slug: string;
  /** Set when the contract is created from a chosen quote. */
  quoteId?: string;
  contractId: string | null;
  initial: ContractInitial;
  suppliers: Opt[];
  categories: Opt[];
  currentFile: string | null;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<ContractFormState, FormData>(saveContract.bind(null, slug, contractId), undefined);
  const v = (k: keyof ContractInitial) => (state?.values?.[k] ?? initial[k]) as string;
  const [supplier, setSupplier] = useState(initial.supplier_id || (suppliers.length ? "" : "new"));
  const [freq, setFreq] = useState(initial.billing_frequency || "monthly");
  const [amount, setAmount] = useState(initial.amount);

  const cents = parseEurosToCents(amount);
  const perYear = FREQUENCIES.find((f) => f.value === freq)?.perYear ?? 1;
  const yearly = cents && cents > 0 && freq !== "one_off" ? fmt.format((cents * perYear) / 100) : null;

  return (
    <form action={action} key={state?.values ? JSON.stringify(state.values) : "initial"} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {quoteId && <input type="hidden" name="quote_id" value={quoteId} />}

      <Card className="flex flex-col gap-4">
        <h3 className="text-[1.0625rem] font-semibold">Supplier and service</h3>
        <div className="field">
          <label htmlFor="supplier_id">Supplier</label>
          <select id="supplier_id" name="supplier_id" className="input" required value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="" disabled>Choose a supplier</option>
            {suppliers.map((o) => <option key={o.id} value={o.id}>{o.name}{o.service_type ? ` · ${o.service_type}` : ""}</option>)}
            <option value="new">A new supplier…</option>
          </select>
        </div>
        {supplier === "new" && (
          <div className="grid gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="new_supplier_name">Supplier name</label>
              <input id="new_supplier_name" name="new_supplier_name" className="input" required maxLength={120} defaultValue={v("new_supplier_name")} placeholder="e.g. Verde Costa Jardinería" />
            </div>
            <div className="field">
              <label htmlFor="new_supplier_service">What they do</label>
              <input id="new_supplier_service" name="new_supplier_service" className="input" required maxLength={80} defaultValue={v("new_supplier_service")} placeholder="e.g. Gardening" />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="title">Service</label>
          <input id="title" name="title" className="input" required maxLength={120} defaultValue={v("title")} placeholder="e.g. Garden maintenance" />
        </div>
        <div className="field">
          <label htmlFor="category_id">Budget category</label>
          <select id="category_id" name="category_id" className="input" defaultValue={v("category_id")}>
            <option value="">None</option>
            {categories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-[1.0625rem] font-semibold">Dates and notice</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="start_date">Start date</label>
            <input id="start_date" name="start_date" type="date" className="input" required defaultValue={v("start_date")} />
          </div>
          <div className="field">
            <label htmlFor="end_date">End date</label>
            <input id="end_date" name="end_date" type="date" className="input" defaultValue={v("end_date")} aria-describedby="end_hint" />
            <p id="end_hint" className="hint">Leave empty for a rolling contract.</p>
          </div>
          <div className="field">
            <label htmlFor="notice_period_days">Notice period (days)</label>
            <input id="notice_period_days" name="notice_period_days" type="number" min={0} max={1095} step={1} inputMode="numeric" className="input" defaultValue={v("notice_period_days")} />
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 hover:bg-surface-2">
          <input type="checkbox" name="auto_renew" defaultChecked={state?.values ? state.values.auto_renew === "on" : initial.auto_renew} className="mt-1 size-5 accent-[var(--brand)]" />
          <span>
            <span className="block font-medium text-ink">Renews automatically</span>
            <span className="text-[0.9375rem] text-muted">Unless notice is given before the notice deadline.</span>
          </span>
        </label>
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-[1.0625rem] font-semibold">Price</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="billing_frequency">Billed</label>
            <select id="billing_frequency" name="billing_frequency" className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount per bill (€)</label>
            <input id="amount" name="amount" inputMode="decimal" className="input tabular" required value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="850.00" aria-describedby="amount_hint" />
          </div>
          <div className="field">
            <label htmlFor="vat_rate">VAT (%)</label>
            <input id="vat_rate" name="vat_rate" inputMode="decimal" className="input tabular" defaultValue={v("vat_rate")} placeholder="21" />
          </div>
        </div>
        <p id="amount_hint" className="hint -mt-1">{yearly ? `About ${yearly} a year before VAT.` : "Before VAT."}</p>
        <div className="field">
          <label htmlFor="price_review_clause">Price review clause</label>
          <textarea id="price_review_clause" name="price_review_clause" className="input min-h-20" maxLength={500} defaultValue={v("price_review_clause")}
            placeholder="e.g. Price reviewed every January in line with CPI (IPC)" />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-[1.0625rem] font-semibold">Notes and signed contract</h3>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input min-h-20" maxLength={2000} defaultValue={v("notes")} placeholder="Anything worth remembering about this contract" />
        </div>
        {currentFile && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-[0.9375rem]">
              <FileText aria-hidden className="size-4 shrink-0 text-muted" /> <span className="truncate">{currentFile}</span>
            </span>
            <label className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-2">
              <input type="checkbox" name="remove_file" className="size-4 accent-[var(--bad)]" /> Remove
            </label>
          </div>
        )}
        <div className="field">
          <label htmlFor="file">{currentFile ? "Replace with a new file" : "Signed contract (optional)"}</label>
          <div className="relative">
            <Paperclip aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input id="file" name="file" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="input pl-9 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-text" />
          </div>
          <p className="hint">PDF, photo, Word or Excel, up to 20 MB.</p>
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
