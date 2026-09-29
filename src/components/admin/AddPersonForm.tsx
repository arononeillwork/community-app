"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import clsx from "clsx";
import { Notice } from "@/components/ui";
import { btn } from "./styles";
import { submitKeepingValues } from "./submit";
import { ROLES, ROLE_HINTS, ROLE_LABELS, TENANCY_TYPES, TENANCY_TYPE_LABELS, needsFlat, type AdminRole } from "./labels";
import type { AdminAction } from "./types";

/**
 * Add a person to the community, or (with `identity`) give an existing person another role or flat.
 * Owners and tenants must be linked to a flat.
 */
export default function AddPersonForm({ action, units, today, identity, idPrefix = "add" }: {
  action: AdminAction;
  units: { id: string; label: string }[];
  today: string;
  identity?: { email: string; name: string };
  idPrefix?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [role, setRole] = useState<AdminRole | "">("");
  const formRef = useRef<HTMLFormElement>(null);
  const id = (k: string) => `${idPrefix}-${k}`;

  // Start again with an empty form after a person was added (errors keep what was typed).
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRole("");
    }
  }, [state]);

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      {identity ? (
        <>
          <input type="hidden" name="email" value={identity.email} />
          <input type="hidden" name="full_name" value={identity.name} />
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor={id("full_name")}>Full name</label>
            <input id={id("full_name")} name="full_name" autoComplete="off" maxLength={120} className="input"
              aria-describedby={id("full_name-hint")} />
            <p id={id("full_name-hint")} className="hint">As it should appear in the app, e.g. “Anna Smith”.</p>
          </div>
          <div className="field">
            <label htmlFor={id("email")}>Email address</label>
            <input id={id("email")} name="email" type="email" required autoComplete="off" className="input"
              aria-describedby={id("email-hint")} />
            <p id={id("email-hint")} className="hint">If they are new, we email them an invitation to sign in.</p>
          </div>
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-bold">{identity ? "Which role?" : "What is this person?"}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <label key={r}
              className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4", role === r ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
              <input type="radio" name="role" value={r} required checked={role === r} onChange={() => setRole(r)}
                className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
              <span>
                <span className="block text-lg font-bold">{ROLE_LABELS[r]}</span>
                <span className="block text-muted">{ROLE_HINTS[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {role && needsFlat(role) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor={id("unit_id")}>Which flat?</label>
            <select id={id("unit_id")} name="unit_id" required className="input" defaultValue="">
              <option value="" disabled>Choose a flat</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          {role === "tenant" && (
            <>
              <div className="field">
                <label htmlFor={id("tenancy_type")}>Type of tenancy</label>
                <select id={id("tenancy_type")} name="tenancy_type" className="input" defaultValue="long_term">
                  {TENANCY_TYPES.map((t) => <option key={t} value={t}>{TENANCY_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={id("end_date")}>Tenancy ends on (optional)</label>
                <input id={id("end_date")} name="end_date" type="date" min={today} className="input"
                  aria-describedby={id("end_date-hint")} />
                <p id={id("end_date-hint")} className="hint">Leave empty if there is no end date. Access stops automatically after this day.</p>
              </div>
            </>
          )}
        </div>
      )}

      <button type="submit" disabled={pending} className={btn("primary", "lg", "w-full sm:w-fit")}>
        <UserPlus aria-hidden className="size-6" />
        {pending ? "Saving…" : identity ? "Give this role" : "Add person"}
      </button>
    </form>
  );
}
