"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

/** Submit button that shows a busy label while its form's server action runs. */
export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, name, value }: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
