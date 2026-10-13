"use client";

import { useFormAction } from "./useFormAction";
import { useState } from "react";
import clsx from "clsx";
import { Card, Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import FlatSelect, { type BlockFlats } from "./FlatSelect";
import TenancyFields from "./TenancyFields";

type State = { error?: string } | undefined;

const ROLES = [
  { value: "owner", title: "Owner", text: "Owns a flat. Sees their block, fees and documents." },
  { value: "tenant", title: "Tenant", text: "Rents a flat. Sees their block and their landlord." },
  { value: "treasurer", title: "Treasurer", text: "Looks after invoices, budgets and owner fees." },
  { value: "admin", title: "Administrator", text: "Runs the community, including these pages." },
];

export default function InviteForm({ action, blocks, today }: {
  action: (prev: State, form: FormData) => Promise<State>;
  blocks: BlockFlats[];
  today: string;
}) {
  const { state, formProps } = useFormAction(action);
  const [role, setRole] = useState("owner");
  const needsFlat = role === "owner" || role === "tenant";

  return (
    <form {...formProps} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Who are you inviting?</h2>
        <div className="field">
          <label htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" className="input" required minLength={2} maxLength={120} autoComplete="off" placeholder="e.g. Ana García" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="off" placeholder="name@example.com" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone <span className="font-normal text-muted">· optional</span></label>
            <input id="phone" name="phone" type="tel" className="input" maxLength={24} autoComplete="off" placeholder="+34 600 123 456" />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
          <legend className="mb-3 text-[1.0625rem] font-semibold">What are they in the community?</legend>
          {ROLES.map((r) => (
            <label key={r.value} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
              role === r.value ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2")}>
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1 size-5 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{r.title}</span>
                <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{r.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsFlat && (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="field">
              <label htmlFor="unit_id">{role === "owner" ? "Which flat do they own?" : "Which flat do they rent?"}</label>
              <FlatSelect id="unit_id" blocks={blocks} />
            </div>
            {role === "tenant" && <TenancyFields idPrefix="invite" today={today} />}
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="hint max-w-md">They get an email with a link. They join once they accept. People who already belong to this community are added straight away.</p>
        <SubmitButton size="lg" pendingLabel="Sending…" className="w-full sm:w-auto sm:px-8">Send invite</SubmitButton>
      </div>
    </form>
  );
}
