"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import { SubmitButton } from "./SubmitButton";

/**
 * A button that opens a small confirmation dialog containing a form. Used for actions that are
 * hard to undo (ending a contract, removing a payment) or that message people (fee reminders).
 * Extra form fields (a date, a note) can be passed as children.
 */
export function ConfirmDialog({ label, ariaLabel, icon, title, description, confirmLabel, pendingLabel, action, children,
  variant = "secondary", confirmVariant = "danger", size = "md", hidden, defaultOpen = false }: {
  label: string;
  /** Fuller accessible name when the same button repeats in a list, e.g. "Send a reminder to the owner of flat B-2B". */
  ariaLabel?: string;
  /** A rendered icon element, e.g. <Square aria-hidden className="size-4" />. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  action: (form: FormData) => void | Promise<void>;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
  confirmVariant?: "primary" | "danger";
  size?: "sm" | "md";
  /** Hidden inputs to send along (e.g. an id). */
  hidden?: Record<string, string>;
  /** Open the dialog as soon as the page loads (e.g. arriving from a "Send reminder" link). */
  defaultOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { if (defaultOpen && !ref.current?.open) ref.current?.showModal(); }, [defaultOpen]);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {icon} {label}
      </button>
      <dialog ref={ref} aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40">
        <form action={async (fd) => { await action(fd); ref.current?.close(); }} className="flex flex-col gap-4 p-5 sm:p-6">
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div>
            <h3 id={titleId} className="text-[1.0625rem] font-semibold">{title}</h3>
            {description && <div className="mt-1 text-[0.9375rem] text-muted">{description}</div>}
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={buttonClass("ghost")} onClick={() => ref.current?.close()}>Cancel</button>
            <SubmitButton variant={confirmVariant} pendingLabel={pendingLabel}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
