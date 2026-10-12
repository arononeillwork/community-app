"use client";

import { Card, Notice } from "@/components/ui";
import { ChoiceCard, FieldGroup } from "@/components/me/fields";
import { SubmitButton, useActionForm, type FormState } from "@/components/me/forms";
import { TENANCY_TYPES } from "../tenancy";

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  units: { id: string; label: string; building: string | null }[];
  unitId: string;
  today: string;
  needsApproval: boolean;
};

export default function AddTenantForm({ action, units, unitId, today, needsApproval }: Props) {
  const { state, pending, formProps } = useActionForm(action);
  const v = state?.values ?? {};

  return (
    <form {...formProps} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Who is moving in?</h2>
        {units.length > 1 ? (
          <div className="field">
            <label htmlFor="unit_id">Flat</label>
            <select id="unit_id" name="unit_id" className="input" defaultValue={v.unit_id || unitId} required>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}{u.building ? ` · ${u.building}` : ""}</option>)}
            </select>
          </div>
        ) : (
          <input type="hidden" name="unit_id" value={units[0].id} />
        )}
        <div className="field">
          <label htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" required minLength={2} maxLength={80} autoComplete="off" className="input" defaultValue={v.full_name} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" className="input" placeholder="name@example.com" defaultValue={v.email} />
            <p className="hint">We send the invitation here.</p>
          </div>
          <div className="field">
            <label htmlFor="phone">Phone <span className="font-normal text-muted">· optional</span></label>
            <input id="phone" name="phone" type="tel" maxLength={24} autoComplete="off" className="input" placeholder="+34 600 123 456" defaultValue={v.phone} />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">About the tenancy</h2>
        <FieldGroup legend="Type">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2">
            {TENANCY_TYPES.map((t) => (
              <ChoiceCard key={t.value} name="tenancy_type" value={t.value} label={t.label} description={t.description}
                defaultChecked={t.value === (v.tenancy_type || "long_term")} />
            ))}
          </div>
        </FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field min-w-0">
            <label htmlFor="start_date">Start date</label>
            <input id="start_date" name="start_date" type="date" required defaultValue={v.start_date || today} className="input min-w-0" />
          </div>
          <div className="field min-w-0">
            <label htmlFor="end_date">End date <span className="font-normal text-muted">· optional</span></label>
            <input id="end_date" name="end_date" type="date" min={today} className="input min-w-0" defaultValue={v.end_date} />
            <p className="hint">Their access ends automatically on this day.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">Note for the office <span className="font-normal text-muted">· optional</span></label>
          <textarea id="note" name="note" maxLength={300} className="input !min-h-20" placeholder="e.g. Two adults and a small dog" defaultValue={v.note} />
        </div>
      </Card>

      <Notice tone="info">
        {needsApproval
          ? "The office approves new tenants before they can sign in. You can see the status under My flat."
          : "Your tenant can sign in as soon as they open the invitation email."}
      </Notice>

      <SubmitButton pending={pending} size="lg" pendingText="Adding…" className="w-full sm:w-auto sm:self-end sm:px-8">Add tenant and send invitation</SubmitButton>
    </form>
  );
}
