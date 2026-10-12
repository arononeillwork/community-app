"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FileText, Paperclip, X } from "lucide-react";
import { Card, Notice, buttonClass } from "@/components/ui";
import { parseEurosToCents } from "@/lib/format";
import { VAT_RATES, requiredApprovals, vatFor } from "@/components/finance/invoice";
import type { InvoiceFormState } from "./actions";

type Supplier = { id: string; name: string; service_type: string };
type Category = { id: string; name: string };
type Contract = { id: string; supplier_id: string; title: string; category_id: string | null; vat_rate: number };

type Props = {
  action: (prev: InvoiceFormState, form: FormData) => Promise<InvoiceFormState>;
  slug: string;
  suppliers: Supplier[];
  categories: Category[];
  contracts: Contract[];
  initial: Record<string, string>;
  currency: string;
  thresholdCents: number | null | undefined;
  cancelHref: string;
  submitLabel: string;
  attachment?: { name: string; url: string | null } | null;
  /** Approvals already given (edit only): they are cleared if amounts or supplier change. */
  approvals?: number;
};

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="text-sm font-medium text-bad">{msg}</p> : null;
}

export default function InvoiceForm(props: Props) {
  const { slug, suppliers, categories, contracts, initial, currency, thresholdCents, cancelHref, submitLabel, attachment, approvals = 0 } = props;
  const [state, dispatch, pending] = useActionState(props.action, undefined);
  const fields = state?.fields ?? {};
  const fmt = useMemo(() => new Intl.NumberFormat("en-GB", { style: "currency", currency }), [currency]);

  const [supplierId, setSupplierId] = useState(initial.supplier_id ?? "");
  const [contractId, setContractId] = useState(initial.contract_id ?? "");
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [net, setNet] = useState(initial.net ?? "");
  const [rate, setRate] = useState(initial.vat_rate || "21");
  const [fileName, setFileName] = useState("");
  const [removeFile, setRemoveFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const dupRef = useRef<HTMLDivElement>(null);

  const supplierContracts = contracts.filter((k) => k.supplier_id === supplierId);
  const netCents = parseEurosToCents(net);
  const vatCents = netCents != null && netCents >= 0 ? vatFor(netCents, Number(rate)) : null;
  const totalCents = netCents != null && vatCents != null ? netCents + vatCents : null;
  const need = totalCents != null ? requiredApprovals(totalCents, thresholdCents) : null;
  const threshold = fmt.format((thresholdCents ?? 100000) / 100);

  useEffect(() => {
    if (state?.error) alertRef.current?.focus();
    else if (state?.duplicates?.length) dupRef.current?.focus();
  }, [state]);

  function onSupplier(id: string) {
    setSupplierId(id);
    if (!contracts.some((k) => k.id === contractId && k.supplier_id === id)) setContractId("");
  }

  function onContract(id: string) {
    setContractId(id);
    const k = contracts.find((x) => x.id === id);
    if (!k) return;
    if (k.category_id) setCategoryId(k.category_id);
    if (VAT_RATES.includes(Number(k.vat_rate) as (typeof VAT_RATES)[number])) setRate(String(Number(k.vat_rate)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  const err = (k: string) => (fields[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});
  const showDuplicates = !!state?.duplicates?.length && !state.error;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {state?.error && (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <Notice tone="bad">
            {state.error}
            {state.duplicates?.map((d) => (
              <span key={d.id} className="mt-1 block">
                <Link href={`/${slug}/finance/invoices/${d.id}`} target="_blank" className="font-medium">Open invoice {d.invoice_number}</Link>
              </span>
            ))}
          </Notice>
        </div>
      )}

      <Card padded={false} className="divide-y divide-line">
        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Supplier</h3>
          <div className="field">
            <label htmlFor="supplier_id">Supplier</label>
            <select id="supplier_id" name="supplier_id" className="input" value={supplierId} onChange={(e) => onSupplier(e.target.value)} required {...err("supplier_id")}>
              <option value="">Choose a supplier</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.service_type}</option>)}
            </select>
            <FieldError id="supplier_id-error" msg={fields.supplier_id} />
            <p className="hint">Not in the list? <Link href={`/${slug}/finance/suppliers/new`}>Add the supplier</Link> first.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="contract_id">Contract <span className="font-normal text-muted">· optional</span></label>
              <select id="contract_id" name="contract_id" className="input" value={contractId} onChange={(e) => onContract(e.target.value)}
                disabled={!supplierId || supplierContracts.length === 0} {...err("contract_id")}>
                <option value="">{!supplierId ? "Choose the supplier first" : supplierContracts.length ? "Not under a contract" : "No contracts with this supplier"}</option>
                {supplierContracts.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
              </select>
              <FieldError id="contract_id-error" msg={fields.contract_id} />
            </div>
            <div className="field">
              <label htmlFor="category_id">Category</label>
              <select id="category_id" name="category_id" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} {...err("category_id")}>
                <option value="">Uncategorised</option>
                {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <FieldError id="category_id-error" msg={fields.category_id} />
            </div>
          </div>
        </section>
  
        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Invoice</h3>
          <div className="field">
            <label htmlFor="invoice_number">Invoice number</label>
            <input id="invoice_number" name="invoice_number" className="input" maxLength={60} defaultValue={initial.invoice_number}
              placeholder="As printed, e.g. FB-2026-140" autoComplete="off" required {...err("invoice_number")} />
            <FieldError id="invoice_number-error" msg={fields.invoice_number} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="issue_date">Invoice date</label>
              <input id="issue_date" name="issue_date" type="date" className="input" defaultValue={initial.issue_date} required {...err("issue_date")} />
              <FieldError id="issue_date-error" msg={fields.issue_date} />
            </div>
            <div className="field">
              <label htmlFor="due_date">Due date <span className="font-normal text-muted">· optional</span></label>
              <input id="due_date" name="due_date" type="date" className="input" defaultValue={initial.due_date} {...err("due_date")} />
              <FieldError id="due_date-error" msg={fields.due_date} />
            </div>
          </div>
        </section>
  
        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Amount</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="net">Amount before VAT</label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
                <input id="net" name="net" inputMode="decimal" className="input pl-8 tabular" value={net} onChange={(e) => setNet(e.target.value)}
                  placeholder="0.00" autoComplete="off" required {...err("net")} />
              </div>
              <FieldError id="net-error" msg={fields.net} />
            </div>
            <fieldset className="field">
              <legend className="label mb-1.5">VAT rate</legend>
              <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-surface-2 p-1 ring-1 ring-inset ring-line">
                {VAT_RATES.map((r) => (
                  <label key={r} className={clsx("flex min-h-10 cursor-pointer items-center justify-center rounded-lg text-[0.9375rem] font-medium tabular transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
                    rate === String(r) ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
                    <input type="radio" name="vat_rate" value={r} checked={rate === String(r)} onChange={() => setRate(String(r))} className="sr-only" />
                    {r} %
                  </label>
                ))}
              </div>
              <FieldError id="vat_rate-error" msg={fields.vat_rate} />
            </fieldset>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-4 text-center" aria-live="polite">
            <div><dt className="text-sm text-muted">Net</dt><dd className="mt-0.5 tabular text-ink-2">{netCents != null && netCents >= 0 ? fmt.format(netCents / 100) : "–"}</dd></div>
            <div><dt className="text-sm text-muted">VAT</dt><dd className="mt-0.5 tabular text-ink-2">{vatCents != null ? fmt.format(vatCents / 100) : "–"}</dd></div>
            <div><dt className="text-sm text-muted">Total</dt><dd className="mt-0.5 font-semibold tabular text-ink">{totalCents != null ? fmt.format(totalCents / 100) : "–"}</dd></div>
          </dl>
          {need != null && (
            <p className="hint">
              {need === 2 ? `Over ${threshold}: needs two approvals before it can be paid.` : "Needs one approval before it can be paid."}
              {approvals > 0 && " Changing the supplier, number or amount clears the approvals given so far."}
            </p>
          )}
        </section>
  
        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Description and file</h3>
          <div className="field">
            <label htmlFor="notes">Description <span className="font-normal text-muted">· optional</span></label>
            <textarea id="notes" name="notes" className="input" maxLength={2000} defaultValue={initial.notes}
              placeholder="What was the work? e.g. Leak repair in the Block B riser" />
          </div>
  
          {attachment && !removeFile && !fileName && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <FileText aria-hidden className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                {attachment.url ? <a href={attachment.url} target="_blank" rel="noopener noreferrer">{attachment.name}</a> : attachment.name}
              </span>
              <button type="button" onClick={() => setRemoveFile(true)} className={buttonClass("ghost", "sm")}>Remove</button>
            </div>
          )}
          {removeFile && <input type="hidden" name="remove_attachment" value="1" />}
          {removeFile && !fileName && (
            <p className="text-[0.9375rem] text-muted">
              The current file will be removed when you save. <button type="button" className="font-medium text-brand-text underline-offset-4 hover:underline" onClick={() => setRemoveFile(false)}>Keep it</button>
            </p>
          )}
  
          <div className="field">
            <span className="label" id="attachment-label">{attachment && !removeFile ? "Replace the file" : "Invoice file"} <span className="font-normal text-muted">· PDF or photo, up to 20 MB</span></span>
            <label className={clsx("flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-ink-2 transition-colors hover:border-brand hover:bg-surface-2",
              fields.attachment ? "border-bad" : "border-line-strong/70")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text"><Paperclip aria-hidden className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fileName || "Choose a file"}</span>
                <span className="block text-sm text-muted">{fileName ? "Ready to upload" : "Scan or photo of the invoice"}</span>
              </span>
              <input ref={fileRef} type="file" name="attachment" accept="application/pdf,image/*" className="sr-only" aria-labelledby="attachment-label"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
            </label>
            {fileName && (
              <button type="button" onClick={() => { if (fileRef.current) fileRef.current.value = ""; setFileName(""); }}
                className="inline-flex w-fit items-center gap-1 text-[0.9375rem] font-medium text-bad hover:underline">
                <X aria-hidden className="size-4" /> Remove this file
              </button>
            )}
            <FieldError id="attachment-error" msg={fields.attachment} />
          </div>
        </section>
      </Card>

      {showDuplicates && (
        <div ref={dupRef} tabIndex={-1} className="outline-none">
          <Notice tone="warn" title="This may be a duplicate">
            <p>This supplier already has a similar invoice:</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {state!.duplicates!.map((d) => (
                <li key={d.id}>
                  <Link href={`/${slug}/finance/invoices/${d.id}`} target="_blank" className="font-medium">{d.invoice_number}</Link>
                  <span> · {new Date(`${d.issue_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {fmt.format(d.total_cents / 100)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5">If it is a different invoice, save it anyway.</p>
          </Notice>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonClass("secondary", "lg")}>Cancel</Link>
        {showDuplicates && (
          <button type="submit" name="confirm_duplicate" value="1" disabled={pending} className={buttonClass("secondary", "lg")}>
            Save anyway
          </button>
        )}
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
