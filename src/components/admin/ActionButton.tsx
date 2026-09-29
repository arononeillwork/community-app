"use client";

import { useActionState, type ReactNode } from "react";
import clsx from "clsx";
import { Notice } from "@/components/ui";
import { btn, type BtnVariant } from "./styles";
import type { AdminAction } from "./types";

/** One-step action button (for safe, easily reversed actions) that shows the result underneath. */
export default function ActionButton({ action, label, pendingLabel = "Please wait…", variant = "primary", icon, className }: {
  action: AdminAction;
  label: string;
  pendingLabel?: string;
  variant?: BtnVariant;
  icon?: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={clsx("flex flex-col gap-2", className)}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <button type="submit" disabled={pending} className={btn(variant, "md", "w-full sm:w-fit")}>
        {icon}{pending ? pendingLabel : label}
      </button>
    </form>
  );
}
