"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Notice, buttonClass } from "@/components/ui";
import SubmitButton from "@/components/admin/SubmitButton";
import type { FaqFormState } from "./faq-actions";

/**
 * Administrators: the answer of one FAQ entry with Edit (inline form) and Delete (asks first).
 * `children` is the answer as residents see it; it is swapped for the form while editing.
 */
export default function FaqEditor({ question, answer, update, remove, children }: {
  question: string;
  answer: string;
  update: (prev: FaqFormState, form: FormData) => Promise<FaqFormState>;
  remove: () => Promise<{ error?: string; deleted?: boolean }>;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [state, formAction] = useActionState(update, undefined);
  const [savedAt, setSavedAt] = useState<number | undefined>();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const last = useRef<"view" | "edit" | "delete">("view");

  // Move focus to the new controls, and back to the button that opened them.
  useEffect(() => {
    if (mode === "delete") keepRef.current?.focus();
    else if (mode === "view" && last.current === "edit") editRef.current?.focus();
    else if (mode === "view" && last.current === "delete") deleteRef.current?.focus();
    last.current = mode;
  }, [mode]);

  // Saved: close the form (the page has already refreshed with the new answer) and say so.
  if (state?.savedAt && state.savedAt !== savedAt) {
    setSavedAt(state.savedAt);
    setMode("view");
  }

  // Submit inside a transition so the form keeps what was typed if the server asks for a fix.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  function confirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const res = await remove();
      if (res.error) setDeleteError(res.error);
      // Deleted: show the notice at the top of the page, like deleting a bin or an information page.
      else router.replace(`${pathname}?deleted=faq`);
    });
  }

  if (mode === "edit") {
    return (
      <form action={formAction} onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        <div className="field">
          <label htmlFor={`${id}-q`}>Question</label>
          <input id={`${id}-q`} name="question" className="input" defaultValue={question} required minLength={5} maxLength={500} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-a`}>Answer</label>
          <textarea id={`${id}-a`} name="answer" className="input" rows={5} defaultValue={answer} required minLength={5} maxLength={4000} autoFocus />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingLabel="Saving…">Save answer</SubmitButton>
          <button type="button" className={buttonClass("ghost")} onClick={() => setMode("view")}>Cancel</button>
          <span className="hint sm:ml-auto">The assistant uses the new answer straight away.</span>
        </div>
      </form>
    );
  }

  return (
    <>
      {children}
      {mode === "delete" ? (
        <div role="group" aria-labelledby={`${id}-del`} className="mt-4 flex flex-col gap-3 rounded-xl bg-bad-soft p-4">
          {deleteError && <Notice tone="bad">{deleteError}</Notice>}
          <p id={`${id}-del`} className="font-medium text-bad">Delete this question? The assistant will stop using the answer.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirmDelete} disabled={deleting} className={buttonClass("danger", "sm")}>
              <Trash2 aria-hidden className="size-4" /> {deleting ? "Deleting…" : "Yes, delete it"}
            </button>
            <button ref={keepRef} type="button" onClick={() => setMode("view")} disabled={deleting} className={buttonClass("secondary", "sm")}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 text-sm">
          <button ref={editRef} type="button" onClick={() => setMode("edit")}
            className="inline-flex min-h-10 items-center gap-1.5 font-medium text-brand-text underline-offset-4 hover:underline">
            <Pencil aria-hidden className="size-3.5" /> Edit<span className="sr-only"> the answer to “{question}”</span>
          </button>
          <button ref={deleteRef} type="button" onClick={() => setMode("delete")}
            className="inline-flex min-h-10 items-center gap-1.5 font-medium text-bad underline-offset-4 hover:underline">
            <Trash2 aria-hidden className="size-3.5" /> Delete<span className="sr-only"> “{question}”</span>
          </button>
          <span role="status" className="inline-flex items-center gap-1.5 text-ok">
            {savedAt ? <><Check aria-hidden className="size-4" /> Saved. The assistant uses the new answer now.</> : null}
          </span>
        </div>
      )}
    </>
  );
}
