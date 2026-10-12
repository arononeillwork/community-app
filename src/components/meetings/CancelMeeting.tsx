"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarX2 } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** "Cancel meeting" with a confirmation dialog. The server action redirects back with a notice. */
export function CancelMeeting({ title, action }: { title: string; action: () => Promise<{ error?: string }> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await action();
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClass("ghost", "md", "text-bad hover:text-bad")}>
        <CalendarX2 aria-hidden className="size-4" /> Cancel meeting
      </button>
      <dialog ref={ref} aria-labelledby="cancel-title" aria-describedby="cancel-text"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40">
        <div className="flex flex-col gap-4 p-6">
          <span className="grid size-11 place-items-center rounded-full bg-bad-soft text-bad">
            <CalendarX2 aria-hidden className="size-5" />
          </span>
          <div>
            <h2 id="cancel-title" className="text-[1.0625rem] font-semibold">Cancel this meeting?</h2>
            <p id="cancel-text" className="mt-1 text-[0.9375rem] text-muted">
              “{title}” will be marked as cancelled and every member gets a notice. You can set it back to Scheduled later.
            </p>
          </div>
          {error && <p role="alert" className="text-[0.9375rem] text-bad">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={() => ref.current?.close()} className={buttonClass("secondary")}>Keep meeting</button>
            <button type="button" onClick={confirm} disabled={pending} className={buttonClass("danger")}>
              {pending ? "Cancelling…" : "Yes, cancel meeting"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
