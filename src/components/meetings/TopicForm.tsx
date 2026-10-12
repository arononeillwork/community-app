"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import type { FormState } from "@/app/[community]/(app)/meetings/actions";
import { FieldError, fieldProps, keepValuesSubmit } from "./form-bits";

/** "Suggest a topic": a button that opens a short form (title 3–200 characters, optional details). */
export function TopicForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // After a successful submit: clear the form and close it.
  useEffect(() => {
    if (state?.okAt) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state?.okAt]);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  const errors = state?.fieldErrors;

  return (
    <div className="flex flex-col gap-3">
      {state?.ok && !open && <Notice tone="ok">{state.message}</Notice>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "md", "w-full sm:w-auto sm:self-start")}>
          <Plus aria-hidden className="size-4" /> Suggest a topic
        </button>
      ) : (
        <form ref={formRef} onSubmit={keepValuesSubmit(formAction)} action={formAction} noValidate
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
          {state?.error && <Notice tone="bad">{state.error}</Notice>}
          <div className="field">
            <label htmlFor="title">Topic</label>
            <input ref={titleRef} {...fieldProps("title", errors, "title-hint")} required minLength={3} maxLength={200}
              className="input aria-invalid:border-bad" placeholder="e.g. Shade sails over the children's play area" />
            <FieldError name="title" errors={errors} />
            <p id="title-hint" className="hint">Keep it short. Neighbours can vote for it.</p>
          </div>
          <div className="field">
            <label htmlFor="description">Details <span className="font-normal text-muted">· optional</span></label>
            <textarea {...fieldProps("description", errors)} maxLength={1000} rows={3}
              className="input aria-invalid:border-bad" placeholder="Why it matters, or what you would like decided" />
            <FieldError name="description" errors={errors} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "Adding…" : "Add topic"}</button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}
