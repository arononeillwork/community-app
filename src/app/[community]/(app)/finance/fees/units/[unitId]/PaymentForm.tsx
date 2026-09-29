"use client";

import { Notice } from "@/components/ui";
import { money } from "@/lib/format";
import { PAYMENT_METHODS } from "@/components/finance/fees/utils";
import { useFormAction } from "@/components/finance/fees/useFormAction";
import { recordPayment } from "../../actions";

export default function PaymentForm({ slug, unitId, unitLabel, today, currency }: {
  slug: string; unitId: string; unitLabel: string; today: string; currency: string;
}) {
  const [state, onSubmit, pending] = useFormAction(recordPayment.bind(null, slug, unitId));
  const ok = state?.ok;
  const m = (c: number) => money(c, currency);

  return (
    <form key={ok?.stamp ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {ok && (
        <Notice tone="ok">
          <p>Payment of {m(ok.amount)} recorded for flat {unitLabel}.</p>
          {ok.applied > 0 && <p className="font-normal">{m(ok.applied)} was used to pay unpaid fees, oldest first.</p>}
          {ok.credit > 0 && (
            <p className="font-normal">
              {ok.applied > 0 ? `${m(ok.credit)} is left over and kept as credit on this flat.` : `There were no unpaid fees, so the whole ${m(ok.credit)} is kept as credit on this flat.`}
            </p>
          )}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="pay-amount">Amount paid (€)</label>
          <input id="pay-amount" name="amount" required inputMode="decimal" autoComplete="off" className="input tabular" placeholder="e.g. 710,87" aria-describedby="pay-amount-hint" />
          <p id="pay-amount-hint" className="hint">Use a comma or a point for cents.</p>
        </div>
        <div className="field">
          <label htmlFor="pay-date">Date the money arrived</label>
          <input id="pay-date" name="paid_on" type="date" required defaultValue={today} max={today} className="input" />
        </div>
        <div className="field">
          <label htmlFor="pay-method">How was it paid?</label>
          <select id="pay-method" name="method" className="input" defaultValue="bank_transfer">
            {PAYMENT_METHODS.map((pm) => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pay-ref">Reference <span className="font-normal text-muted">(optional)</span></label>
          <input id="pay-ref" name="reference" maxLength={200} className="input" placeholder="e.g. text on the bank statement" />
        </div>
      </div>
      <p className="hint">The payment pays off the oldest unpaid fee first. Anything extra is kept as credit.</p>
      <button type="submit" disabled={pending} className="min-h-14 w-full rounded-xl bg-brand px-6 text-lg font-bold text-brand-ink hover:brightness-110 disabled:opacity-60 sm:w-fit">
        {pending ? "Saving…" : "Record payment"}
      </button>
    </form>
  );
}
