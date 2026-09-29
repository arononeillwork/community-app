"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Notice } from "@/components/ui";
import type { ButtonAction } from "./form";
import SubmitButton from "./SubmitButton";
import { btn, type BtnVariant } from "./styles";

/**
 * Two-step action: the first button only asks the question; the second ("Yes, …") really submits.
 * The form posts confirm=yes, which the server action checks.
 */
export default function ConfirmAction({
  action, label, question, confirmLabel, cancelLabel = "No, go back", variant = "secondary", confirmVariant = "danger", icon,
}: {
  action: ButtonAction;
  label: string;
  question: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: BtnVariant;
  confirmVariant?: BtnVariant;
  icon?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  // The question stays open until the action answers (a new state closes it again).
  const [openedFor, setOpenedFor] = useState<{ s: typeof state } | null>(null);
  const asking = openedFor !== null && openedFor.s === state;
  const questionRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (asking) {
      opened.current = true;
      questionRef.current?.focus();
    } else if (opened.current) {
      triggerRef.current?.focus();
    }
  }, [asking]);

  return (
    <div className="flex flex-col gap-2">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      {!asking ? (
        <button ref={triggerRef} type="button" onClick={() => setOpenedFor({ s: state })} className={btn(variant, "md", "w-full sm:w-auto")}>
          {icon}{label}
        </button>
      ) : (
        <form action={formAction}
          className={clsx("flex flex-col gap-3 rounded-xl border-2 p-4",
            confirmVariant === "danger" ? "border-bad/40 bg-bad-soft" : "border-brand bg-brand-soft")}>
          <p ref={questionRef} tabIndex={-1} className="font-bold text-ink outline-none">{question}</p>
          <input type="hidden" name="confirm" value="yes" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant={confirmVariant} size="md" pendingLabel="Please wait…">{confirmLabel}</SubmitButton>
            <button type="button" onClick={() => setOpenedFor(null)} className={btn("secondary")}>{cancelLabel}</button>
          </div>
        </form>
      )}
    </div>
  );
}
