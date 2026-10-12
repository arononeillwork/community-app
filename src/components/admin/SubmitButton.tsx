"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

/** Submit button that shows a short "working" label while its form is being sent. */
export default function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, name, value, "aria-label": ariaLabel }: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-label={ariaLabel} className={buttonClass(variant, size, className)}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
