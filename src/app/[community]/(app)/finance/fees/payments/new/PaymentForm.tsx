"use client";

import { useActionState, useState } from "react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { METHODS } from "@/components/finance-ops/dates";
import { recordPayment, type FeeFormState } from "../../actions";

export type FlatOption = { id: string; label: string; block: string; owners: string; owed: number; since: string | null };

const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });

export default function PaymentForm({ slug, flats, unitId, today, cancelHref }: {
  slug: string; flats: FlatOption[]; unitId: string; today: string; cancelHref: string;
}) {
  const [state, action, pending] = useActionState<FeeFormState, FormData>(recordPayment.bind(null, slug), undefined);
  const [unit, setUnit] = useState(unitId);
  const flat = flats.find((f) => f.id === unit);
  const [amount, setAmount] = useState(flat && flat.owed > 0 ? (flat.owed / 100).toFixed(2) : "");
  const v = (k: string, d: string) => state?.values?.[k] ?? d;
  const blocks = Array.from(new Set(flats.map((f) => f.block)));

  return (
    <form action={action} key={state?.values ? JSON.stringify(state.values) : "initial"} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="unit_id">Flat</label>
          <select id="unit_id" name="unit_id" className="input" required value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              const f = flats.find((x) => x.id === e.target.value);
              setAmount(f && f.owed > 0 ? (f.owed / 100).toFixed(2) : "");
            }}>
            <option value="" disabled>Choose a flat</option>
            {blocks.map((b) => (
              <optgroup key={b} label={b}>
                {flats.filter((f) => f.block === b).map((f) => (
                  <option key={f.id} value={f.id}>{f.label}{f.owners ? ` · ${f.owners}` : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {flat && (
            <p className="hint" aria-live="polite">
              {flat.owed > 0 ? `Owes ${fmt.format(flat.owed / 100)}${flat.since ? ` since ${flat.since}` : ""}.` : "Nothing overdue."}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="amount">Amount received (€)</label>
            <input id="amount" name="amount" inputMode="decimal" className="input tabular" required value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="paid_on">Date received</label>
            <input id="paid_on" name="paid_on" type="date" className="input" required max={today} defaultValue={v("paid_on", today)} />
          </div>
          <div className="field">
            <label htmlFor="method">Paid by</label>
            <select id="method" name="method" className="input" defaultValue={v("method", "bank_transfer")}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reference">Reference <span className="font-normal text-muted">(optional)</span></label>
            <input id="reference" name="reference" className="input" maxLength={140} defaultValue={v("reference", "")} placeholder="e.g. bank transfer text" />
          </div>
        </div>
        <p className="hint">The payment goes to the flat&apos;s oldest unpaid charges first. Anything extra is kept as credit.</p>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : "Record payment"}</button>
      </div>
    </form>
  );
}
