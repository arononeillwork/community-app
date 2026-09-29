"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog. Hidden on the printed page itself. */
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}
      className="no-print inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink hover:bg-bg">
      <Printer aria-hidden className="size-5" />
      {label}
    </button>
  );
}
