"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui";

type State = { error?: string; success?: string } | undefined;

/**
 * A one-button form for a server action that needs no input (e.g. "Create the charges").
 * With `confirm`, the first tap only shows the explanation and a second "Yes, …" button,
 * so nothing happens by accident.
 */
export default function ActionForm({
  action, label, pendingLabel = "Working…", confirm, confirmLabel, variant = "primary",
}: {
  action: () => Promise<State>;
  label: string;
  pendingLabel?: string;
  confirm?: ReactNode;
  confirmLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, run, pending] = useActionState<State>(action, undefined);
  const [asking, setAsking] = useState(false);
  const btn = variant === "primary"
    ? "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-bold text-brand-ink hover:brightness-110 disabled:opacity-60"
    : "inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink hover:bg-bg disabled:opacity-60";

  return (
    <form action={() => { setAsking(false); run(); }} className="flex flex-col gap-3">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
      {confirm && !asking ? (
        <button type="button" className={`${btn} w-fit`} onClick={() => setAsking(true)} disabled={pending}>
          {pending ? pendingLabel : label}
        </button>
      ) : confirm ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-warn/40 bg-warn-soft p-4">
          <div className="font-bold">{confirm}</div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btn} disabled={pending}>{pending ? pendingLabel : confirmLabel ?? `Yes, ${label.toLowerCase()}`}</button>
            <button type="button" onClick={() => setAsking(false)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink hover:bg-bg">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" className={`${btn} w-fit`} disabled={pending}>{pending ? pendingLabel : label}</button>
      )}
    </form>
  );
}
