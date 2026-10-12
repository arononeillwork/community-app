"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, Notice, buttonClass } from "@/components/ui";

/**
 * Two-step delete: the first button asks, the second one deletes.
 * `action` is a bound server action; it redirects on success or returns an error to show.
 */
export default function ConfirmDelete({ action, title, description, label, question }: {
  action: () => Promise<{ error?: string } | void>;
  /** Card title, e.g. "Delete document". */
  title: string;
  /** One line under the title, e.g. "Residents will no longer see it." */
  description: string;
  /** Button text, e.g. "Delete document". */
  label: string;
  /** The question shown on the second step, e.g. "Delete “House rules”? This cannot be undone." */
  question: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keepRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (confirming) { opened.current = true; keepRef.current?.focus(); }
    else if (opened.current) askRef.current?.focus();
  }, [confirming]);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[0.9375rem] text-muted">{description}</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {confirming ? (
        <div role="group" aria-labelledby="delete-question" className="flex flex-col gap-3 rounded-xl bg-bad-soft p-4">
          <p id="delete-question" className="font-medium text-bad">{question}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={remove} disabled={pending} className={buttonClass("danger")}>
              <Trash2 aria-hidden className="size-4" /> {pending ? "Deleting…" : "Yes, delete it"}
            </button>
            <button ref={keepRef} type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClass("secondary")}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button ref={askRef} type="button" onClick={() => setConfirming(true)} className={buttonClass("secondary")}>
            <span className="inline-flex items-center gap-2 text-bad"><Trash2 aria-hidden className="size-4" /> {label}</span>
          </button>
        </div>
      )}
    </Card>
  );
}
