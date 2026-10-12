"use client";

import { useActionState, useState } from "react";
import { Button, Card, Notice, buttonClass } from "@/components/ui";
import { parseEurosToCents } from "@/lib/format";
import { createLevy, type FeeFormState } from "../../actions";

const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });

export default function LevyForm({ slug, flats, defaultDue, cancelHref }: { slug: string; flats: number; defaultDue: string; cancelHref: string }) {
  const [state, action, pending] = useActionState<FeeFormState, FormData>(createLevy.bind(null, slug), undefined);
  const [total, setTotal] = useState("");
  const v = (k: string, d = "") => state?.values?.[k] ?? d;
  const cents = parseEurosToCents(total);

  return (
    <form action={action} key={state?.values ? JSON.stringify(state.values) : "initial"} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="input" required maxLength={120} defaultValue={v("title")} placeholder="e.g. Lift modernisation levy" />
        </div>
        <div className="field">
          <label htmlFor="description">What it is for <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="description" name="description" className="input min-h-20" maxLength={1000} defaultValue={v("description")}
            placeholder="e.g. Approved at the extraordinary meeting of 5 October." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="total">Total to collect (€)</label>
            <input id="total" name="total" inputMode="decimal" className="input tabular" required value={total} onChange={(e) => setTotal(e.target.value)} placeholder="4000.00" />
          </div>
          <div className="field">
            <label htmlFor="due_date">Owners pay by</label>
            <input id="due_date" name="due_date" type="date" className="input" required defaultValue={v("due_date", defaultDue)} />
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 hover:bg-surface-2">
          <input type="checkbox" name="split" defaultChecked={state?.values ? state.values.split === "on" : true} className="mt-1 size-5 accent-[var(--brand)]" />
          <span>
            <span className="block font-medium text-ink">Split it across the flats now</span>
            <span className="text-[0.9375rem] text-muted">
              Each of the {flats} flats is charged its share by participation coefficient
              {cents && cents > 0 ? `, about ${fmt.format(cents / 100 / Math.max(1, flats))} on average` : ""}.
            </span>
          </span>
        </label>
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button href={cancelHref} variant="ghost">Cancel</Button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>{pending ? "Saving…" : "Save levy"}</button>
      </div>
    </form>
  );
}
