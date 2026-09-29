"use client";

import { Printer } from "lucide-react";
import { btnClass } from "./styles";

/** Opens the browser's print dialog. Hidden on the printed page itself. */
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btnClass("secondary", "md", "no-print")}>
      <Printer aria-hidden className="size-5" />
      {label}
    </button>
  );
}
