"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Masked IBAN with a Show button. The full number is fetched only when asked for, and hidden again on request. */
export default function IbanReveal({ masked, reveal }: { masked: string; reveal: () => Promise<{ iban?: string; error?: string }> }) {
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    if (full) { setFull(null); return; }
    start(async () => {
      const r = await reveal();
      if (r.iban) { setFull(r.iban); setError(null); } else setError(r.error ?? "The IBAN could not be shown.");
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="tabular" aria-live="polite">{full ?? masked}</span>
      <button type="button" onClick={toggle} disabled={pending} aria-pressed={!!full}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-text hover:bg-surface-2">
        {full ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        {pending ? "Loading…" : full ? "Hide" : "Show"}
      </button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </span>
  );
}
