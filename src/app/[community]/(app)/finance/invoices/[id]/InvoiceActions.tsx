"use client";

import { startTransition, useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Wallet } from "lucide-react";
import { approveInvoice, disputeInvoice, markInvoicePaid, reopenInvoice, type InvoiceActionState } from "../../actions";
import { Button, Notice } from "@/components/ui";

type Props = {
  slug: string;
  id: string;
  status: "received" | "approved" | "paid" | "disputed";
  approvals: number;
  required: number;
  iApproved: boolean;
  today: string;
  paidDateLabel: string | null;
};

type ActionName = "approve" | "pay" | "dispute" | "reopen";

export default function InvoiceActions({ slug, id, status, approvals, required, iApproved, today, paidDateLabel }: Props) {
  // All hooks live here (not in conditional children) so a message survives the page refreshing after a change.
  const [approveState, approve, approving] = useActionState(() => approveInvoice(slug, id), undefined);
  const [payState, pay, paying] = useActionState(markInvoicePaid.bind(null, slug, id), undefined);
  const [disputeState, dispute, disputing] = useActionState(disputeInvoice.bind(null, slug, id), undefined);
  const [reopenState, reopen, reopening] = useActionState(reopenInvoice.bind(null, slug, id), undefined);
  const [last, setLast] = useState<ActionName | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  // Close the dispute box whenever the status changes (e.g. after disputing and later reopening).
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setShowDispute(false);
  }

  const states: Record<ActionName, InvoiceActionState> = { approve: approveState, pay: payState, dispute: disputeState, reopen: reopenState };
  const current = last ? states[last] : undefined;
  const busy = approving || paying || disputing || reopening;

  // Submit without React's automatic form reset, so typed text is kept if there is a problem.
  function submit(name: ActionName, dispatch: (fd: FormData) => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setLast(name);
      startTransition(() => dispatch(fd));
    };
  }

  const missing = Math.max(0, required - approvals);
  const waitingForOther = status === "received" && iApproved && missing > 0;
  const justDid = (name: ActionName) => last === name && !!states[name]?.message;

  return (
    <div className="flex flex-col gap-4">
      {current?.error && <Notice tone="bad">{current.error}</Notice>}
      {current?.message && <Notice tone={current.tone === "info" ? "info" : "ok"}>{current.message}</Notice>}

      {status === "received" && (
        waitingForOther ? (
          !justDid("approve") && <Notice tone="info">You approved this. Waiting for another committee member to approve it too.</Notice>
        ) : (
          <form onSubmit={submit("approve", approve)} className="flex flex-col gap-2">
            <p>
              Approving means you have checked this invoice and agree it should be paid.
              {missing > 1 && " It needs two different committee members to approve it."}
            </p>
            <Button type="submit" size="lg" disabled={busy}>
              <CheckCircle2 aria-hidden className="size-6" /> {approving ? "Saving…" : "Approve this invoice"}
            </Button>
          </form>
        )
      )}

      {status === "approved" && (
        <form onSubmit={submit("pay", pay)} className="flex flex-col gap-3">
          <p>When the money has left the community bank account, record it here.</p>
          <div className="field">
            <label htmlFor="paid_date">Date paid</label>
            <input id="paid_date" name="paid_date" type="date" className="input" defaultValue={today} max={today} required />
          </div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 font-bold">
            <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
            Yes, this invoice has been paid
          </label>
          <Button type="submit" size="lg" disabled={busy}>
            <Wallet aria-hidden className="size-6" /> {paying ? "Saving…" : "Mark as paid"}
          </Button>
        </form>
      )}

      {status === "paid" && !justDid("pay") && (
        <Notice tone="ok">Paid{paidDateLabel ? ` on ${paidDateLabel}` : ""}. Nothing more to do.</Notice>
      )}

      {status === "disputed" && (
        <form onSubmit={submit("reopen", reopen)} className="flex flex-col gap-3">
          <Notice tone="bad">This invoice is disputed. It is not counted in spending and cannot be paid.</Notice>
          <p>If the problem is sorted out (for example the supplier sent a correction), reopen it so it can be approved again.</p>
          <div className="field">
            <label htmlFor="reopen_note">What was agreed? <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="reopen_note" name="note" className="input" maxLength={1000} />
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            <RotateCcw aria-hidden className="size-6" /> {reopening ? "Saving…" : "Reopen this invoice"}
          </Button>
        </form>
      )}

      {(status === "received" || status === "approved") && (
        <div className="border-t border-line pt-4">
          {!showDispute ? (
            <button type="button" onClick={() => setShowDispute(true)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink hover:bg-bg">
              <AlertTriangle aria-hidden className="size-5" /> There is a problem with this invoice
            </button>
          ) : (
            <form onSubmit={submit("dispute", dispute)} className="flex flex-col gap-3 rounded-xl border-2 border-bad/40 bg-bad-soft p-4">
              <p className="font-bold">Mark this invoice as disputed?</p>
              <p>It will not be paid or counted in spending until someone reopens it. Your reason is added to the notes.</p>
              <div className="field">
                <label htmlFor="reason">What is wrong?</label>
                <textarea id="reason" name="reason" className="input" required minLength={3} maxLength={1000} autoFocus
                  placeholder="e.g. We were charged for 4 visits but only 3 happened" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" disabled={busy}>{disputing ? "Saving…" : "Yes, mark as disputed"}</Button>
                <button type="button" onClick={() => setShowDispute(false)}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-bold text-ink underline hover:bg-surface">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
