"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Card, Notice, buttonClass } from "@/components/ui";
import type { SupplierFormState } from "./actions";

type Values = {
  name?: string; service_type?: string; tax_id?: string | null; contact_name?: string | null; email?: string | null;
  phone?: string | null; notes?: string | null; active?: boolean;
};

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="text-sm font-medium text-bad">{msg}</p> : null;
}

export default function SupplierForm({ action, slug, initial = {}, serviceTypes, maskedIban, editing = false, cancelHref, submitLabel }: {
  action: (prev: SupplierFormState, form: FormData) => Promise<SupplierFormState>;
  slug: string;
  initial?: Values;
  serviceTypes: string[];
  /** Edit only: the stored IBAN, masked. The full number never reaches the form. */
  maskedIban?: string | null;
  editing?: boolean;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const fields = state?.fields ?? {};
  const [ibanAction, setIbanAction] = useState<"keep" | "change" | "remove">(maskedIban ? "keep" : "change");
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (state?.error) alertRef.current?.focus(); }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }
  const err = (k: string) => (fields[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {state?.error && (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <Notice tone="bad">
            {state.error}
            {state.existingId && (
              <> <Link href={`/${slug}/finance/suppliers/${state.existingId}`} className="font-medium">Open that supplier</Link></>
            )}
          </Notice>
        </div>
      )}

      <Card padded={false} className="divide-y divide-line">
        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Company</h3>
          <div className="field">
            <label htmlFor="name">Company name</label>
            <input id="name" name="name" className="input" maxLength={120} defaultValue={initial.name} required
              placeholder="e.g. Fontanería Benítez" autoComplete="organization" {...err("name")} />
            <FieldError id="name-error" msg={fields.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="service_type">Service</label>
              <input id="service_type" name="service_type" className="input" maxLength={80} defaultValue={initial.service_type} required
                list="service-types" placeholder="e.g. Plumbing" autoComplete="off" {...err("service_type")} />
              <datalist id="service-types">{serviceTypes.map((t) => <option key={t} value={t} />)}</datalist>
              <FieldError id="service_type-error" msg={fields.service_type} />
            </div>
            <div className="field">
              <label htmlFor="tax_id">Tax ID (CIF/NIF) <span className="font-normal text-muted">· optional</span></label>
              <input id="tax_id" name="tax_id" className="input uppercase" maxLength={20} defaultValue={initial.tax_id ?? ""}
                placeholder="e.g. B29000010" autoComplete="off" {...err("tax_id")} />
              <FieldError id="tax_id-error" msg={fields.tax_id} />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Contact</h3>
          <div className="field">
            <label htmlFor="contact_name">Contact person <span className="font-normal text-muted">· optional</span></label>
            <input id="contact_name" name="contact_name" className="input" maxLength={120} defaultValue={initial.contact_name ?? ""}
              placeholder="Who to ask for" autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="phone">Phone <span className="font-normal text-muted">· optional</span></label>
              <input id="phone" name="phone" type="tel" className="input" maxLength={30} defaultValue={initial.phone ?? ""}
                placeholder="+34 952 100 010" autoComplete="off" {...err("phone")} />
              <FieldError id="phone-error" msg={fields.phone} />
            </div>
            <div className="field">
              <label htmlFor="email">Email <span className="font-normal text-muted">· optional</span></label>
              <input id="email" name="email" type="email" className="input" maxLength={160} defaultValue={initial.email ?? ""}
                placeholder="office@example.com" autoComplete="off" {...err("email")} />
              <FieldError id="email-error" msg={fields.email} />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[1.0625rem] font-semibold">Payment and notes</h3>
          <input type="hidden" name="iban_action" value={ibanAction} />
          {ibanAction !== "change" && maskedIban ? (
            <div className="field">
              <span className="label">IBAN</span>
              <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3.5 py-2">
                <span className={`tabular flex-1 ${ibanAction === "remove" ? "text-muted line-through" : "text-ink"}`}>{maskedIban}</span>
                {ibanAction === "keep" ? (
                  <>
                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIbanAction("change")}>Change</button>
                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIbanAction("remove")}>Remove</button>
                  </>
                ) : (
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIbanAction("keep")}>Keep it</button>
                )}
              </div>
              {ibanAction === "remove" && <p className="hint">The IBAN will be removed when you save.</p>}
            </div>
          ) : (
            <div className="field">
              <label htmlFor="iban">{maskedIban ? "New IBAN" : "IBAN"} <span className="font-normal text-muted">· {maskedIban ? "replaces the current one" : "optional"}</span></label>
              <input id="iban" name="iban" className="input tabular uppercase" maxLength={42} autoComplete="off" spellCheck={false}
                placeholder="ES00 0000 0000 0000 0000 0000" {...err("iban")} />
              <FieldError id="iban-error" msg={fields.iban} />
              {maskedIban && (
                <button type="button" className="w-fit text-[0.9375rem] font-medium text-brand-text underline-offset-4 hover:underline"
                  onClick={() => setIbanAction("keep")}>Keep the current IBAN</button>
              )}
              <p className="hint">Only the administrator and treasurer can see bank details.</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="notes">Notes <span className="font-normal text-muted">· optional</span></label>
            <textarea id="notes" name="notes" className="input" maxLength={2000} defaultValue={initial.notes ?? ""}
              placeholder="e.g. Available for emergency call-outs at weekends" />
          </div>
          {editing && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-4">
              <input type="checkbox" name="active" value="1" defaultChecked={initial.active ?? true} className="mt-1 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block font-medium text-ink">We still work with this supplier</span>
                <span className="text-[0.9375rem] text-muted">Untick to hide them when adding invoices. Their history stays.</span>
              </span>
            </label>
          )}
        </section>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonClass("secondary", "lg")}>Cancel</Link>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
