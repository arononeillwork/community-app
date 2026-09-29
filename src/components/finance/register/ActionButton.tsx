"use client";

import { useActionState, type ReactNode } from "react";
import { Notice } from "@/components/ui";
import type { ButtonAction } from "./form";
import SubmitButton from "./SubmitButton";
import type { BtnVariant } from "./styles";

/** A single button that runs a server action (no confirmation) and shows a friendly error if it fails. */
export default function ActionButton({
  action, children, pendingLabel = "Please wait…", variant = "secondary", size = "md",
}: {
  action: ButtonAction;
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: BtnVariant;
  size?: "md" | "lg";
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <div><SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>{children}</SubmitButton></div>
    </form>
  );
}
