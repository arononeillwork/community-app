"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { Notice, buttonClass } from "@/components/ui";

/** What a form's server action returns. `values` echoes the submitted fields back after an error, so nothing typed is lost. */
export type FormState = { ok?: boolean; error?: string; message?: string; values?: Record<string, string> } | undefined;
type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/**
 * useActionState for a form, without React's automatic form reset: after an error the person's
 * typing stays in the fields. (The plain `action` is kept for browsers without JavaScript.)
 */
export function useActionForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  return { state, pending, formProps: { action: formAction, onSubmit } };
}

/** Submit button that shows a busy label while its form is being sent. */
export function SubmitButton({ children, pendingText = "Saving…", variant = "primary", size = "md", className, name, value, pending: busy }: {
  children: ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
  size?: "sm" | "md" | "lg"; className?: string; name?: string; value?: string; pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = status.pending || !!busy;
  return (
    <button type="submit" disabled={pending} name={name} value={value} className={buttonClass(variant, size, clsx("!whitespace-normal py-2 text-center", className))} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * A form bound to a server action that returns { ok, error, message }.
 * Shows the error, or a "Saved" notice until the person edits the form again.
 */
export function ActionForm({ action, children, submitLabel, savedText = "Saved.", className, footerNote }: {
  action: Action; children: ReactNode; submitLabel: string; savedText?: string; className?: string; footerNote?: ReactNode;
}) {
  const { state, pending, formProps } = useActionForm(action);
  const [editedAfter, setEditedAfter] = useState<FormState | null>(null);
  const showResult = state && editedAfter !== state;

  return (
    <form {...formProps} onChange={() => setEditedAfter(state)} className={clsx("flex flex-col gap-5", className)}>
      {children}
      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1" aria-live="polite">
          {showResult && state.error && <Notice tone="bad">{state.error}</Notice>}
          {showResult && state.ok && <Notice tone="ok">{state.message ?? savedText}</Notice>}
          {!showResult && footerNote && <p className="hint">{footerNote}</p>}
        </div>
        <SubmitButton pending={pending} className="w-full sm:w-auto">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * A destructive action that asks once before it runs ("End now" → "End access today?").
 * The confirm button submits the surrounding form's action.
 */
export function ConfirmAction({ action, label, question, confirmLabel, cancelLabel = "Keep it", icon }: {
  action: () => Promise<void>; label: string; question: string; confirmLabel: string; cancelLabel?: string; icon?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={buttonClass("ghost", "sm", "text-bad hover:text-bad")}>
        {icon}{label}
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-bad-soft px-3 py-2 sm:w-auto">
      <span className="text-[0.9375rem] text-bad">{question}</span>
      <span className="ml-auto flex gap-2">
        <button type="button" onClick={() => setAsking(false)} className={buttonClass("ghost", "sm")}>{cancelLabel}</button>
        <SubmitButton variant="danger" size="sm" pendingText="Ending…">{confirmLabel}</SubmitButton>
      </span>
    </form>
  );
}
