"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Notice } from "@/components/ui";
import { valueGetter, type FormAction } from "./form";
import SubmitButton from "./SubmitButton";
import { btn } from "./styles";

export type SupplierInitial = {
  name: string; service_type: string; contact_name: string; email: string; phone: string; website: string;
  address: string; tax_id: string; iban: string; notes: string;
};

const COMMON_SERVICES = [
  "Gardening", "Pool maintenance", "Lift maintenance", "Cleaning", "Concierge", "Building insurance",
  "Security", "General repairs", "Electricity (common areas)", "Water", "Property administration", "Pest control",
];

export default function SupplierForm({
  action, initial, serviceTypes, submitLabel, cancelHref,
}: {
  action: FormAction;
  initial: SupplierInitial;
  serviceTypes: string[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const v = valueGetter(state, initial);
  const services = Array.from(new Set([...serviceTypes, ...COMMON_SERVICES])).sort((a, b) => a.localeCompare(b));

  return (
    <form key={state?.stamp ?? "initial"} action={formAction} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. The company</h2>
        <div className="field">
          <label htmlFor="name">Company name</label>
          <input id="name" name="name" className="input" required maxLength={200} defaultValue={v("name")} placeholder="e.g. Jardines del Sol S.L." />
        </div>
        <div className="field">
          <label htmlFor="service_type">What do they do for the community?</label>
          <input id="service_type" name="service_type" className="input" required maxLength={120} list="service-types"
            defaultValue={v("service_type")} placeholder="e.g. Gardening" aria-describedby="service_hint" />
          <datalist id="service-types">
            {services.map((x) => <option key={x} value={x} />)}
          </datalist>
          <p id="service_hint" className="hint">Choose from the suggestions or type your own.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. How to contact them</h2>
        <div className="field">
          <label htmlFor="contact_name">Contact person <span className="font-normal text-muted">(optional)</span></label>
          <input id="contact_name" name="contact_name" className="input" maxLength={200} defaultValue={v("contact_name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="phone">Phone <span className="font-normal text-muted">(optional)</span></label>
            <input id="phone" name="phone" type="tel" className="input" maxLength={60} defaultValue={v("phone")} />
          </div>
          <div className="field">
            <label htmlFor="email">Email <span className="font-normal text-muted">(optional)</span></label>
            <input id="email" name="email" type="email" className="input" maxLength={200} defaultValue={v("email")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="website">Website <span className="font-normal text-muted">(optional)</span></label>
          <input id="website" name="website" inputMode="url" className="input" maxLength={300} defaultValue={v("website")} placeholder="e.g. www.example.com" />
        </div>
        <div className="field">
          <label htmlFor="address">Address <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="address" name="address" className="input !min-h-20" maxLength={500} defaultValue={v("address")} />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Tax and bank details</h2>
        <p className="text-muted">Only the administrator and the treasurer can see these.</p>
        <div className="field">
          <label htmlFor="tax_id">Tax ID (CIF / NIF) <span className="font-normal text-muted">(optional)</span></label>
          <input id="tax_id" name="tax_id" className="input sm:max-w-xs" maxLength={40} defaultValue={v("tax_id")} aria-describedby="tax_hint" />
          <p id="tax_hint" className="hint">The company&apos;s tax number. It is printed on their invoices.</p>
        </div>
        <div className="field">
          <label htmlFor="iban">Bank account (IBAN) <span className="font-normal text-muted">(optional)</span></label>
          <input id="iban" name="iban" className="input tabular" maxLength={60} defaultValue={v("iban")} placeholder="ES91 2100 0418 4502 0005 1332" aria-describedby="iban_hint" />
          <p id="iban_hint" className="hint">Where the community pays them. Starts with two letters.</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">4. Notes</h2>
        <div className="field">
          <label htmlFor="notes">Notes <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="notes" name="notes" className="input" maxLength={4000} defaultValue={v("notes")} />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className={btn("secondary", "lg")}>Cancel</Link>
      </div>
    </form>
  );
}
