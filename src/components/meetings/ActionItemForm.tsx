"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import type { FormState } from "@/app/[community]/(app)/meetings/actions";
import { FieldError, keepValuesSubmit } from "./form-bits";

/** Admin: add a follow-up action (task, who, by when). */
export function ActionItemForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state?.fieldErrors;

  useEffect(() => {
    if (state?.okAt) formRef.current?.reset();
  }, [state?.okAt]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm", "w-fit")}>
        <Plus aria-hidden className="size-4" /> Add an action
      </button>
    );
  }

  const props = (name: string) => ({
    id: `ai-${name}`, name,
    "aria-invalid": e?.[name] ? true : undefined,
    "aria-describedby": e?.[name] ? `${name}-error` : undefined,
  });

  return (
    <form ref={formRef} action={formAction} onSubmit={keepValuesSubmit(formAction)} noValidate
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.message}</Notice>}
      <div className="field">
        <label htmlFor="ai-title">What needs doing</label>
        <input {...props("title")} required maxLength={200} className="input aria-invalid:border-bad" placeholder="e.g. Ask three companies for a quote" />
        <FieldError name="title" errors={e} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="ai-owner_name">Who <span className="font-normal text-muted">· optional</span></label>
          <input {...props("owner_name")} maxLength={100} className="input aria-invalid:border-bad" placeholder="e.g. Administrator" />
          <FieldError name="owner_name" errors={e} />
        </div>
        <div className="field">
          <label htmlFor="ai-due_date">By when <span className="font-normal text-muted">· optional</span></label>
          <input type="date" {...props("due_date")} className="input aria-invalid:border-bad" />
          <FieldError name="due_date" errors={e} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "Adding…" : "Add action"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>Close</button>
      </div>
    </form>
  );
}
