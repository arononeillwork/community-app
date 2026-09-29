"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btn, type BtnVariant } from "./styles";

/** Submit button that shows "Saving…" and blocks double taps while its form is being sent. */
export default function SubmitButton({
  children, pendingLabel = "Saving…", variant = "primary", size = "lg", className,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: BtnVariant;
  size?: "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={btn(variant, size, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
