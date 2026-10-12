"use client";

import { startTransition, useActionState, useState } from "react";
import { BadgeCheck, Banknote, Flag, RotateCcw } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import type { ActionState } from "../actions";

type Act = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Submit without React's automatic form reset, so typed text survives a validation error. */
function keepInput(dispatch: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

/** What can happen to the invoice next, depending on its status. */
export default function InvoiceActions({ status, canApprove, approveNote, today, approve, pay, dispute, reopen }: {
  status: string;
  canApprove: boolean;
  approveNote: string | null;
  today: string;
  approve: Act; pay: Act; dispute: Act; reopen: Act;
}) {
  const [approveState, approveAction, approving] = useActionState(approve, undefined);
  const [payState, payAction, paying] = useActionState(pay, undefined);
  const [disputeState, disputeAction, disputing] = useActionState(dispute, undefined);
  const [reopenState, reopenAction, reopening] = useActionState(reopen, undefined);
  const [open, setOpen] = useState<"pay" | "dispute" | null>(null);

  const error = approveState?.error ?? payState?.error ?? disputeState?.error ?? reopenState?.error;
  const canPay = status === "approved";
  const canDispute = status === "received" || status === "approved";

  if (status === "paid") return null;

  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="bad">{error}</Notice>}

      {status === "received" && canApprove && (
        <form action={approveAction}>
          <button type="submit" disabled={approving} className={buttonClass("primary", "md", "w-full")}>
            <BadgeCheck aria-hidden className="size-4" /> {approving ? "Approving…" : "Approve invoice"}
          </button>
        </form>
      )}
      {status === "received" && !canApprove && approveNote && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-[0.9375rem] text-muted">{approveNote}</p>
      )}

      {canPay && (open === "pay" ? (
        <form onSubmit={keepInput(payAction)} noValidate className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="field">
            <label htmlFor="paid_date">Date paid</label>
            <input id="paid_date" name="paid_date" type="date" className="input" defaultValue={today} max={today} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={paying} className={buttonClass("primary", "md", "flex-1")}>{paying ? "Saving…" : "Mark as paid"}</button>
            <button type="button" onClick={() => setOpen(null)} className={buttonClass("ghost", "md")}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen("pay")} className={buttonClass("primary", "md", "w-full")}>
          <Banknote aria-hidden className="size-4" /> Mark as paid
        </button>
      ))}

      {canDispute && (open === "dispute" ? (
        <form onSubmit={keepInput(disputeAction)} noValidate className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="field">
            <label htmlFor="reason">What is wrong with it?</label>
            <textarea id="reason" name="reason" className="input" required minLength={5} maxLength={1000}
              placeholder="e.g. Extra hours charged that were not agreed" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={disputing} className={buttonClass("danger", "md", "flex-1")}>{disputing ? "Saving…" : "Dispute invoice"}</button>
            <button type="button" onClick={() => setOpen(null)} className={buttonClass("ghost", "md")}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen("dispute")} className={buttonClass("secondary", "md", "w-full")}>
          <Flag aria-hidden className="size-4" /> Dispute
        </button>
      ))}

      {status === "disputed" && (
        <form action={reopenAction}>
          <button type="submit" disabled={reopening} className={buttonClass("secondary", "md", "w-full")}>
            <RotateCcw aria-hidden className="size-4" /> {reopening ? "Saving…" : "Resolve the dispute"}
          </button>
          <p className="hint mt-2">When the supplier has corrected the invoice or the issue is settled, this sends it back for approval and payment.</p>
        </form>
      )}
    </div>
  );
}
