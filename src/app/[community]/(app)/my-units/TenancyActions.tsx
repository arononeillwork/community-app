"use client";

import { useState } from "react";
import { CalendarClock, CalendarX2 } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import { ConfirmAction, SubmitButton, useActionForm, type FormState } from "@/components/me/forms";

type Props = {
  tenancyId: string;
  name: string;
  pending: boolean;
  startDate: string;
  endDate: string | null;
  today: string;
  endAction: () => Promise<void>;
  changeAction: (prev: FormState, form: FormData) => Promise<FormState>;
};

/** "Change end date" and "End now" for one tenancy. */
export default function TenancyActions({ tenancyId, name, pending, startDate, endDate, today, endAction, changeAction }: Props) {
  const [open, setOpen] = useState(false);
  const { state, pending: saving, formProps } = useActionForm(changeAction);
  const first = name.split(" ")[0] || "them";
  const min = startDate > today ? startDate : today;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`end-${tenancyId}`}
          className={buttonClass("ghost", "sm")}>
          <CalendarClock aria-hidden className="size-4" /> Change end date
        </button>
        <ConfirmAction action={endAction}
          label={pending ? "Withdraw" : "End now"}
          icon={<CalendarX2 aria-hidden className="size-4" />}
          question={pending ? `Withdraw ${first}'s tenancy?` : `End ${first}'s access today?`}
          confirmLabel={pending ? "Yes, withdraw" : "Yes, end now"} />
      </div>
      {state?.ok && !open && <Notice tone="ok">{state.message}</Notice>}
      {open && (
        <form id={`end-${tenancyId}`} {...formProps}
          className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4 ring-1 ring-inset ring-line">
          {state?.error && <Notice tone="bad">{state.error}</Notice>}
          {state?.ok && <Notice tone="ok">{state.message}</Notice>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="field min-w-0 flex-1">
              <label htmlFor={`end-date-${tenancyId}`}>New end date</label>
              <input id={`end-date-${tenancyId}`} name="end_date" type="date" min={min} defaultValue={endDate ?? ""} className="input min-w-0" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "md")}>Close</button>
              <SubmitButton pending={saving}>Save date</SubmitButton>
            </div>
          </div>
          <p className="hint">Access ends automatically on this day. Leave it empty for no end date.</p>
        </form>
      )}
    </div>
  );
}
