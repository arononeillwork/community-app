"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Notice } from "@/components/ui";
import { btn, type BtnVariant } from "./styles";
import { submitKeepingValues } from "./submit";
import type { AdminAction } from "./types";

/**
 * Two-step action for anything that is hard to undo.
 * The first button only asks the question; the second ("Yes, …") really submits.
 * The form posts confirm=yes, which the server action checks as well.
 * Optional `children` are extra form fields (for example "change to which role?").
 */
export default function ConfirmAction({
  action, label, question, confirmLabel, cancelLabel = "No, go back", variant = "secondary", confirmVariant = "danger",
  icon, children, className,
}: {
  action: AdminAction;
  label: string;
  question: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: BtnVariant;
  confirmVariant?: BtnVariant;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // The question stays open until the action answers (a new state closes it again).
  const [openedFor, setOpenedFor] = useState<{ s: typeof state } | null>(null);
  const asking = openedFor !== null && openedFor.s === state;
  const questionRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const qid = useId();

  // Move keyboard / screen-reader focus to the question, and back to the button afterwards.
  useEffect(() => {
    if (asking) {
      opened.current = true;
      questionRef.current?.focus();
    } else if (opened.current) {
      triggerRef.current?.focus();
    }
  }, [asking]);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className={clsx("flex flex-col gap-3", className)}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      {children}
      {!asking ? (
        <button ref={triggerRef} type="button" onClick={() => setOpenedFor({ s: state })} className={btn(variant, "md", "w-full sm:w-fit")}>
          {icon}{label}
        </button>
      ) : (
        <div role="group" aria-labelledby={qid}
          className={clsx("flex flex-col gap-3 rounded-xl border-2 p-4",
            confirmVariant === "danger" ? "border-bad/40 bg-bad-soft" : "border-brand bg-brand-soft")}>
          <p id={qid} ref={questionRef} tabIndex={-1} className="font-bold text-ink outline-none">{question}</p>
          <input type="hidden" name="confirm" value="yes" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={btn(confirmVariant)}>
              {pending ? "Please wait…" : confirmLabel}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpenedFor(null)} className={btn("secondary")}>{cancelLabel}</button>
          </div>
        </div>
      )}
    </form>
  );
}
