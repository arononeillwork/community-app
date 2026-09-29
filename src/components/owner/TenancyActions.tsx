"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarClock, UserX } from "lucide-react";
import { Card, Notice, StatusBadge } from "@/components/ui";
import { btnClass } from "./styles";
import type { OwnerAction } from "./types";

export type TenancyForActions = {
  id: string;
  name: string;
  typeLabel: string;
  status: string;
  start_date: string;
  end_date: string | null;
  startLabel: string;
  endLabel: string;
};

/**
 * Change the end date of a current tenancy, or end it now.
 * Ending is a two-step action: the first button only asks, the second ("Yes, …") submits confirm=yes.
 */
export default function TenancyActions({ tenancy, today, changeAction, endAction }: {
  tenancy: TenancyForActions;
  today: string;
  changeAction: OwnerAction;
  endAction: OwnerAction;
}) {
  const [changeState, change, changing] = useActionState(changeAction, undefined);
  const [endState, end, ending] = useActionState(endAction, undefined);
  const [asking, setAsking] = useState(false);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // Move keyboard / screen-reader focus to the question, and back to the button when cancelled.
  useEffect(() => {
    if (asking) {
      opened.current = true;
      questionRef.current?.focus();
    } else if (opened.current) {
      triggerRef.current?.focus();
    }
  }, [asking]);

  const notStarted = tenancy.start_date > today;
  const minEnd = tenancy.start_date > today ? tenancy.start_date : today;
  const ids = { end: `end-${tenancy.id}`, hint: `end-hint-${tenancy.id}` };

  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-lg font-bold">{tenancy.name}</h5>
        <StatusBadge value={tenancy.status} />
      </div>
      <p>
        {tenancy.typeLabel} · from <strong>{tenancy.startLabel}</strong> · {tenancy.end_date ? <>until <strong>{tenancy.endLabel}</strong></> : "no end date"}
      </p>
      {tenancy.status === "pending" && (
        <p className="text-muted">Waiting for the office to approve this tenancy. Your tenant can use the app once it is approved.</p>
      )}

      {/* Change end date */}
      <form action={change} className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-4">
        {changeState?.error && <Notice tone="bad">{changeState.error}</Notice>}
        {changeState?.ok && <Notice tone="ok">{changeState.ok}</Notice>}
        <div className="field">
          <label htmlFor={ids.end}>Change the end date</label>
          <input id={ids.end} name="end_date" type="date" min={minEnd} className="input sm:max-w-xs"
            defaultValue={tenancy.end_date ?? ""} aria-describedby={ids.hint} />
          <p id={ids.hint} className="hint">Leave empty for an open-ended tenancy. Access ends automatically after the end date.</p>
        </div>
        <button type="submit" disabled={changing} className={btnClass("secondary", "md", "w-fit")}>
          <CalendarClock aria-hidden className="size-5" />
          {changing ? "Saving…" : "Save end date"}
        </button>
      </form>

      {/* End tenancy (with confirmation) */}
      {!asking ? (
        <button ref={triggerRef} type="button" onClick={() => setAsking(true)}
          className={btnClass("secondary", "md", "w-fit border-bad text-bad")}>
          <UserX aria-hidden className="size-5" />
          {notStarted ? "Cancel this tenancy" : "End tenancy now"}
        </button>
      ) : (
        <form action={end} className="flex flex-col gap-3 rounded-xl border-2 border-bad/40 bg-bad-soft p-4">
          {endState?.error && <Notice tone="bad">{endState.error}</Notice>}
          <p ref={questionRef} tabIndex={-1} className="font-bold text-ink outline-none">
            {notStarted
              ? `Cancel ${tenancy.name}'s tenancy? It has not started yet, and they will not get access to the app for this flat.`
              : `End ${tenancy.name}'s tenancy today? From today they will no longer have access to the app for this flat.`}
          </p>
          <input type="hidden" name="confirm" value="yes" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={ending} className={btnClass("danger")}>
              {ending ? "Please wait…" : notStarted ? "Yes, cancel the tenancy" : "Yes, end the tenancy"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={btnClass("secondary")}>No, keep it</button>
          </div>
        </form>
      )}
    </Card>
  );
}
