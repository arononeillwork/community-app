"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows a "working" label and blocks double taps while its form is being sent. */
export default function SubmitButton({
  children, pendingLabel, className, name, value, pressed, disabled,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
  name?: string;
  value?: string;
  /** For toggle buttons (aria-pressed). */
  pressed?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending || disabled}
      aria-pressed={pressed}
      aria-busy={pending || undefined}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
