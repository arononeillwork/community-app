"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { createInvoice } from "../../actions";
import { Card, Notice } from "@/components/ui";
import { money, parseEurosToCents } from "@/lib/format";
import { VAT_RATES, addDaysInput, vatFromNet } from "@/components/finance/invoice-utils";

export type SupplierOpt = { id: string; name: string; active: boolean };
export type ContractOpt = {
  id: string; title: string; status: string; supplier_id: string; supplier_name: string;
  category_id: string | null; vat_rate: number | null;
};
export type CategoryOpt = { id: string; name: string };

export default function InvoiceForm({
  slug, suppliers, contracts, categories, today, currency, defaultSupplierId, defaultContractId,
}: {
  slug: string;
  suppliers: SupplierOpt[];
  contracts: ContractOpt[];
  categories: CategoryOpt[];
  today: string;
  currency: string;
  defaultSupplierId?: string;
  defaultContractId?: string;
}) {
  const [state, dispatch, pending] = useActionState(createInvoice.bind(null, slug), undefined);

  const initialContract = contracts.find((c) => c.id === defaultContractId);
  const initialRate = initialContract?.vat_rate != null && VAT_RATES.some((r) => Number(r.value) === Number(initialContract.vat_rate))
    ? String(Number(initialContract.vat_rate)) : "21";

  const initialSupplier = initialContract?.supplier_id ?? suppliers.find((x) => x.id === defaultSupplierId)?.id ?? "";
  const [supplierId, setSupplierId] = useState(initialSupplier);
  const [contractId, setContractId] = useState(initialContract?.id ?? "");
  const [categoryId, setCategoryId] = useState(initialContract?.category_id ?? "");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysInput(today, 30));
  const [dueTouched, setDueTouched] = useState(false);
  const [net, setNet] = useState("");
  const [rate, setRate] = useState(initialRate);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The form is long: bring a problem message into view.
  useEffect(() => {
    if (state?.error) errorRef.current?.scrollIntoView({ block: "center" });
  }, [state]);

  const netCents = parseEurosToCents(net);
  const vatCents = netCents != null && netCents > 0 ? vatFromNet(netCents, Number(rate)) : null;

  // Contracts: only the chosen supplier's, otherwise all of them grouped by supplier.
  const contractGroups = useMemo(() => {
    const list = supplierId ? contracts.filter((c) => c.supplier_id === supplierId) : contracts;
    const groups = new Map<string, ContractOpt[]>();
    for (const c of list) groups.set(c.supplier_name, [...(groups.get(c.supplier_name) ?? []), c]);
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contracts, supplierId]);

  function chooseSupplier(id: string) {
    setSupplierId(id);
    const c = contracts.find((x) => x.id === contractId);
    if (c && c.supplier_id !== id) setContractId("");
  }

  function chooseContract(id: string) {
    setContractId(id);
    const c = contracts.find((x) => x.id === id);
    if (!c) return;
    setSupplierId(c.supplier_id);
    if (!categoryId && c.category_id) setCategoryId(c.category_id);
    if (c.vat_rate != null && VAT_RATES.some((r) => Number(r.value) === Number(c.vat_rate))) setRate(String(Number(c.vat_rate)));
  }

  function chooseIssueDate(v: string) {
    setIssueDate(v);
    if (!dueTouched && v) setDueDate(addDaysInput(v, 30));
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName("");
  }

  // Submit without React's automatic form reset, so nothing typed is lost if there is a problem.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const selectedContracts = supplierId ? contracts.filter((c) => c.supplier_id === supplierId).length : contracts.length;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {state?.error && (
        <div ref={errorRef}>
          <Notice tone="bad">
            {state.error}
            {state.existingId && (
              <>
                {" "}
                <Link href={`/${slug}/finance/invoices/${state.existingId}`} className="underline">Open the invoice already entered</Link>
              </>
            )}
          </Notice>
        </div>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. Who sent the invoice?</h2>
        <div className="field">
          <label htmlFor="supplier_id">Supplier</label>
          <select id="supplier_id" name="supplier_id" className="input" required value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
            <option value="">Choose the supplier</option>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>{x.name}{x.active ? "" : " (no longer used)"}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contract_id">Contract <span className="font-normal text-muted">(optional)</span></label>
          <select id="contract_id" name="contract_id" className="input" value={contractId} onChange={(e) => chooseContract(e.target.value)}>
            <option value="">{selectedContracts === 0 && supplierId ? "This supplier has no contract" : "No contract / one-off job"}</option>
            {contractGroups.map(([supplier, list]) => (
              <optgroup key={supplier} label={supplier}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{supplierId ? "" : ` (${supplier})`}{c.status === "active" ? "" : ` (${c.status})`}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="hint">If the invoice is for a regular service (like cleaning or the lift), choose its contract.</p>
        </div>
        <div className="field">
          <label htmlFor="category_id">Category</label>
          <select id="category_id" name="category_id" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Not sure (uncategorised)</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="hint">The category decides which budget line the spending counts against.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Invoice details</h2>
        <div className="field">
          <label htmlFor="invoice_number">Invoice number</label>
          <input id="invoice_number" name="invoice_number" className="input" required maxLength={80} autoComplete="off" placeholder="e.g. F-2026-0142" />
          <p className="hint">Usually at the top of the invoice, next to “Factura nº”.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="issue_date">Invoice date</label>
            <input id="issue_date" name="issue_date" type="date" className="input" required value={issueDate}
              onChange={(e) => chooseIssueDate(e.target.value)} />
            <p className="hint">The date printed on the invoice.</p>
          </div>
          <div className="field">
            <label htmlFor="due_date">Due date</label>
            <input id="due_date" name="due_date" type="date" className="input" value={dueDate} min={issueDate || undefined}
              onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
            <p className="hint">The last day to pay. We fill in 30 days after the invoice date; change it if the invoice says otherwise.</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Amount</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="net">Amount before VAT, in euros</label>
            <input id="net" name="net" className="input tabular" inputMode="decimal" required autoComplete="off" placeholder="e.g. 850.00"
              value={net} onChange={(e) => setNet(e.target.value)} />
            <p className="hint">The price without tax (“Base imponible” on Spanish invoices).</p>
          </div>
          <div className="field">
            <label htmlFor="vat_rate">VAT rate (IVA)</label>
            <select id="vat_rate" name="vat_rate" className="input" value={rate} onChange={(e) => setRate(e.target.value)}>
              {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="hint">VAT is the tax added on top of the price. Use the rate printed on the invoice.</p>
          </div>
        </div>
        <div className="rounded-xl border-2 border-line bg-bg p-4" aria-live="polite">
          {vatCents != null && netCents != null ? (
            <dl className="tabular grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-lg">
              <dt>Before VAT</dt><dd className="text-right">{money(netCents, currency)}</dd>
              <dt>VAT at {rate}%</dt><dd className="text-right">{money(vatCents, currency)}</dd>
              <dt className="font-bold">Total to pay</dt><dd className="text-right font-bold">{money(netCents + vatCents, currency)}</dd>
            </dl>
          ) : (
            <p className="text-muted">Type the amount to see the VAT and the total.</p>
          )}
          <p className="hint mt-2">The VAT is worked out again when you save. Check the total matches the invoice.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">4. Notes and the invoice file <span className="font-normal text-muted">(optional)</span></h2>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" maxLength={4000} placeholder="e.g. Extra work on the pool pump, agreed at the June meeting" />
        </div>
        <div className="field">
          <span className="label" id="file-label">Invoice file (PDF or photo, up to 20 MB)</span>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-5 text-center font-bold hover:border-brand focus-within:border-brand">
            <FileText aria-hidden className="size-10 text-brand" />
            {fileName ? "Choose a different file" : "Choose the PDF or take a photo"}
            <input ref={fileRef} type="file" name="file" accept="application/pdf,image/*" aria-labelledby="file-label" className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
          </label>
          {fileName && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold">Selected: {fileName}</span>
              <button type="button" onClick={clearFile} className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 font-bold text-bad underline">
                <X aria-hidden className="size-4" /> Remove file
              </button>
            </div>
          )}
        </div>
      </Card>

      <button type="submit" disabled={pending} className="min-h-16 rounded-xl bg-brand text-xl font-bold text-brand-ink disabled:opacity-60">
        {pending ? "Saving…" : "Save invoice"}
      </button>
    </form>
  );
}
