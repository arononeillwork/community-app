"use client";

import { useFormAction } from "./useFormAction";
import { useState } from "react";
import { Notice, buttonClass } from "@/components/ui";
import SubmitButton from "./SubmitButton";

type State = { error?: string } | undefined;

/** One question the assistant could not answer, with "Add to FAQ" (inline form) and "Dismiss". */
export default function UnansweredQuestion({ id, question, meta, addAction, dismissAction }: {
  id: string;
  question: string;
  meta: string;
  addAction: (prev: State, form: FormData) => Promise<State>;
  dismissAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { state, formProps } = useFormAction(addAction);

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-ink">{question}</p>
          <p className="mt-0.5 text-sm text-muted">{meta}</p>
        </div>
        {!open && (
          <div className="flex shrink-0 gap-2">
            <button type="button" className={buttonClass("soft", "sm")} onClick={() => setOpen(true)} aria-controls={`faq-${id}`}
              aria-expanded={false} aria-label={`Add an answer to the FAQ for: ${question}`}>
              Add to FAQ
            </button>
            <form action={dismissAction}>
              <SubmitButton variant="ghost" size="sm" pendingLabel="Dismissing…" aria-label={`Dismiss the question: ${question}`}>Dismiss</SubmitButton>
            </form>
          </div>
        )}
      </div>

      {open && (
        <form id={`faq-${id}`} {...formProps} className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4">
          {state?.error && <Notice tone="bad">{state.error}</Notice>}
          <div className="field">
            <label htmlFor={`q-${id}`}>Question</label>
            <input id={`q-${id}`} name="question" className="input" defaultValue={question} required minLength={5} maxLength={500} />
            <p className="hint">Tidy it up so it reads well in the FAQ.</p>
          </div>
          <div className="field">
            <label htmlFor={`a-${id}`}>Answer</label>
            <textarea id={`a-${id}`} name="answer" className="input" required minLength={5} maxLength={4000} autoFocus
              placeholder="The answer residents should get, in a sentence or two." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingLabel="Saving…">Save to FAQ</SubmitButton>
            <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>Cancel</button>
            <span className="hint sm:ml-auto">The assistant uses FAQ answers straight away.</span>
          </div>
        </form>
      )}
    </li>
  );
}
