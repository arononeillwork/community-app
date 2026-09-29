"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, Notice } from "@/components/ui";
import { money, parseEurosToCents } from "@/lib/format";
import { CONTRACT_STATUSES, FREQUENCIES, annualCents, withVat } from "./dates";
import { FILE_ACCEPT, MAX_FILE_MB, checkedGetter, valueGetter, type FormAction } from "./form";
import SubmitButton from "./SubmitButton";
import { btn } from "./styles";

export type ContractInitial = {
  supplier_id: string;
  category_id: string;
  title: string;
  start_date: string;
  end_date: string;
  notice_period_days: string;
  auto_renew: boolean;
  billing_frequency: string;
  amount: string;
  vat_rate: string;
  price_review_clause: string;
  status: string;
  notes: string;
};

type Opt = { id: string; name: string; active?: boolean };

export default function ContractForm({
  action, suppliers, categories, initial, hasFile, submitLabel, cancelHref, currency = "EUR", addSupplierHref,
}: {
  action: FormAction;
  suppliers: Opt[];
  categories: Opt[];
  initial: ContractInitial;
  hasFile: boolean;
  submitLabel: string;
  cancelHref: string;
  currency?: string;
  addSupplierHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const { auto_renew, ...initialText } = initial;
  const v = valueGetter(state, initialText);
  const checked = checkedGetter(state, { auto_renew });

  // Live "per year" preview. Only used for display; the inputs stay uncontrolled.
  const [amount, setAmount] = useState(v("amount"));
  const [freq, setFreq] = useState(v("billing_frequency"));
  const [vat, setVat] = useState(v("vat_rate"));
  const cents = parseEurosToCents(amount);
  const yearly = cents == null ? null : annualCents(cents, freq);
  const vatNum = Number(vat.replace(",", "."));

  return (
    <form key={state?.stamp ?? "initial"} action={formAction} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. Who is the contract with?</h2>
        <div className="field">
          <label htmlFor="supplier_id">Supplier (company)</label>
          <select id="supplier_id" name="supplier_id" className="input" required defaultValue={v("supplier_id")}>
            <option value="">Choose a supplier</option>
            {suppliers.map((o) => <option key={o.id} value={o.id}>{o.name}{o.active === false ? " (inactive)" : ""}</option>)}
          </select>
          <p className="hint">Not in the list? <Link href={addSupplierHref} className="font-bold text-brand underline">Add the supplier first</Link>.</p>
        </div>
        <div className="field">
          <label htmlFor="category_id">Type of cost (category)</label>
          <select id="category_id" name="category_id" className="input" defaultValue={v("category_id")}>
            <option value="">No category</option>
            {categories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <p className="hint">Used to compare spending with the budget.</p>
        </div>
        <div className="field">
          <label htmlFor="title">Contract name</label>
          <input id="title" name="title" className="input" required maxLength={200} defaultValue={v("title")} placeholder="e.g. Garden maintenance" />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Dates and notice</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="start_date">Start date</label>
            <input id="start_date" name="start_date" type="date" className="input" required defaultValue={v("start_date")} />
          </div>
          <div className="field">
            <label htmlFor="end_date">End date <span className="font-normal text-muted">(optional)</span></label>
            <input id="end_date" name="end_date" type="date" className="input" defaultValue={v("end_date")} aria-describedby="end_hint" />
            <p id="end_hint" className="hint">Leave empty for a rolling contract with no end date.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="notice_period_days">Notice period (days)</label>
          <input id="notice_period_days" name="notice_period_days" type="number" inputMode="numeric" min={0} max={3650} step={1}
            className="input sm:max-w-xs" required defaultValue={v("notice_period_days")} aria-describedby="notice_hint" />
          <p id="notice_hint" className="hint">
            How many days before the end date you must tell the company you want to end or change the contract. Use 0 if there is none.
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-xl border-2 border-line p-4">
          <input type="checkbox" name="auto_renew" defaultChecked={checked("auto_renew")} className="mt-1 size-6 accent-[var(--brand)]" />
          <span>
            <span className="block font-bold">This contract renews automatically</span>
            <span className="text-muted">It starts again for another period unless someone gives notice in time.</span>
          </span>
        </label>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Cost</h2>
        <div className="field">
          <label htmlFor="billing_frequency">How often is it billed?</label>
          <select id="billing_frequency" name="billing_frequency" className="input" required defaultValue={v("billing_frequency")}
            onChange={(e) => setFreq(e.target.value)}>
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="amount">Amount per billing period, in euros (without VAT)</label>
            <input id="amount" name="amount" inputMode="decimal" className="input tabular" required defaultValue={v("amount")}
              placeholder="e.g. 850,00" onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="vat_rate">VAT rate (%)</label>
            <input id="vat_rate" name="vat_rate" inputMode="decimal" className="input tabular" required defaultValue={v("vat_rate")}
              aria-describedby="vat_hint" onChange={(e) => setVat(e.target.value)} />
            <p id="vat_hint" className="hint">VAT (IVA) is the tax added to the price. In Spain it is usually 21. Use 0 if there is no VAT.</p>
          </div>
        </div>
        {yearly != null && (
          <p className="rounded-xl bg-brand-soft p-4" aria-live="polite">
            Cost per year: <strong className="tabular">{money(yearly, currency)}</strong> without VAT
            {Number.isFinite(vatNum) && <> (<span className="tabular">{money(withVat(yearly, vatNum), currency)}</span> with VAT)</>}.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">4. Terms and notes</h2>
        <div className="field">
          <label htmlFor="price_review_clause">Price review clause <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="price_review_clause" name="price_review_clause" className="input" maxLength={4000} defaultValue={v("price_review_clause")}
            aria-describedby="review_hint" />
          <p id="review_hint" className="hint">When and how the price can go up, for example “Price rises each January in line with inflation (IPC)”.</p>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" required defaultValue={v("status")}>
            {CONTRACT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="notes">Notes <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="notes" name="notes" className="input" maxLength={4000} defaultValue={v("notes")} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">5. Contract file <span className="font-normal text-muted">(optional)</span></h2>
        {hasFile && <p>A file is already attached. Choose a new file only if you want to replace it.</p>}
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-5 text-center font-bold hover:border-brand">
          <FileText aria-hidden className="size-10 text-brand" />
          Choose the signed contract (PDF or photo)
          <input type="file" name="file" accept={FILE_ACCEPT} className="w-full max-w-sm text-base font-normal" />
        </label>
        <p className="hint">Up to {MAX_FILE_MB} MB. Only finance users can open it.</p>
        {state?.error && <p className="hint">If you had chosen a file, please choose it again.</p>}
      </Card>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className={btn("secondary", "lg")}>Cancel</Link>
      </div>
    </form>
  );
}
