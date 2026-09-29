"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Card, Notice } from "@/components/ui";
import { TENANCY_TYPES } from "./labels";
import { btnClass } from "./styles";
import type { OwnerAction } from "./types";

/** "Add a tenant" form for one flat. The server action re-checks that the signed-in owner owns this flat. */
export default function AddTenantForm({ action, unitId, unitLabel, requiresApproval, today }: {
  action: OwnerAction;
  unitId: string;
  unitLabel: string;
  requiresApproval: boolean;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = state?.values ?? {};

  return (
    <Card className="flex flex-col gap-4">
      <h4 id="add-tenant" className="flex items-center gap-2 text-lg font-bold">
        <UserPlus aria-hidden className="size-6" /> Add a tenant to flat {unitLabel}
      </h4>
      <p className="text-muted">
        We will email your tenant an invitation to use the app. If they already have an account, they can sign in straight away.
      </p>
      {requiresApproval && (
        <Notice tone="info">In this community the office must approve new tenants. Your tenant can use the app once the office has approved them.</Notice>
      )}
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      {/* Remount after every submission so the fields show the right default values. */}
      <form key={state?.stamp ?? 0} action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="unit_id" value={unitId} />

        <div className="field">
          <label htmlFor="tenant-name">Tenant&apos;s full name</label>
          <input id="tenant-name" name="full_name" required maxLength={120} autoComplete="off" className="input" defaultValue={v.full_name} />
        </div>

        <div className="field">
          <label htmlFor="tenant-email">Tenant&apos;s email address</label>
          <input id="tenant-email" name="email" type="email" required maxLength={200} autoComplete="off" className="input" defaultValue={v.email} />
          <p className="hint">The invitation is sent to this address.</p>
        </div>

        <div className="field">
          <label htmlFor="tenant-phone">Tenant&apos;s phone number (optional)</label>
          <input id="tenant-phone" name="phone" type="tel" maxLength={40} autoComplete="off" className="input" defaultValue={v.phone} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold">Type of tenancy</legend>
          {TENANCY_TYPES.map((t) => (
            <label key={t.value}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="tenancy_type" value={t.value} required
                defaultChecked={(v.tenancy_type || "long_term") === t.value}
                className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
              <span>
                <span className="block font-bold">{t.label}</span>
                <span className="text-muted">{t.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="tenant-start">Start date</label>
            <input id="tenant-start" name="start_date" type="date" required className="input" defaultValue={v.start_date || today} />
          </div>
          <div className="field">
            <label htmlFor="tenant-end">End date (optional)</label>
            <input id="tenant-end" name="end_date" type="date" min={today} className="input" defaultValue={v.end_date} aria-describedby="tenant-end-hint" />
            <p id="tenant-end-hint" className="hint">Leave empty for an open-ended tenancy. Access to the app ends automatically after this date.</p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="tenant-note">Note (optional)</label>
          <textarea id="tenant-note" name="note" maxLength={500} className="input" defaultValue={v.note} aria-describedby="tenant-note-hint" />
          <p id="tenant-note-hint" className="hint">For example: &quot;Rental contract for one year&quot;. The office can see this note.</p>
        </div>

        <button type="submit" disabled={pending} className={btnClass("primary", "lg", "w-full sm:w-fit")}>
          <UserPlus aria-hidden className="size-6" />
          {pending ? "Adding the tenant…" : "Add tenant"}
        </button>
      </form>
    </Card>
  );
}
