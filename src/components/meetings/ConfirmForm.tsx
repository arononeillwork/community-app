"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import SubmitButton from "./SubmitButton";
import { buttonClass } from "./meeting-utils";

/**
 * Two-step destructive action: the first button only asks; the second ("Yes, …") really submits.
 * The form posts confirm=yes, which the server action checks.
 */
export default function ConfirmForm({
  action, trigger, question, confirmLabel, cancelLabel = "No, keep it", triggerVariant = "secondary", className,
}: {
  action: (form: FormData) => void | Promise<void>;
  trigger: ReactNode;
  question: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  triggerVariant?: "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
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

  if (!asking) {
    return (
      <button ref={triggerRef} type="button" onClick={() => setAsking(true)} className={`${buttonClass(triggerVariant)} ${className ?? ""}`}>
        {trigger}
      </button>
    );
  }

  return (
    <form action={action} className={`flex flex-col gap-3 rounded-xl border-2 border-bad/40 bg-bad-soft p-4 ${className ?? ""}`}>
      <p ref={questionRef} tabIndex={-1} className="font-bold text-ink outline-none">{question}</p>
      <input type="hidden" name="confirm" value="yes" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton className={buttonClass("danger")} pendingLabel="Please wait…">{confirmLabel}</SubmitButton>
        <button type="button" onClick={() => setAsking(false)} className={buttonClass("secondary")}>{cancelLabel}</button>
      </div>
    </form>
  );
}
