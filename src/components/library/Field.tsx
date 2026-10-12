import clsx from "clsx";
import type { ReactNode } from "react";

/** Form field: visible label, the control, then the error (if any) or a hint. Pair with fieldProps(). */
export function Field({ id, label, error, hint, children, className, optional }: {
  id: string; label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; optional?: boolean;
}) {
  return (
    <div className={clsx("field", className)}>
      <label htmlFor={id}>{label}{optional && <span className="font-normal text-muted"> · optional</span>}</label>
      {children}
      {error ? <p id={`${id}-error`} className="text-sm text-bad">{error}</p> : hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
    </div>
  );
}

/** id / name / aria wiring for a control inside <Field>. */
export function fieldProps(id: string, error?: string, hint?: boolean) {
  return {
    id, name: id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/** A group of radio cards or checkboxes with a visible legend. */
export function Choices({ legend, error, hint, children, className, id }: {
  legend: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; id: string;
}) {
  return (
    <fieldset className={clsx("flex flex-col gap-2", className)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 text-[0.9375rem] font-medium text-ink">{legend}</legend>
      {children}
      {error ? <p id={`${id}-error`} className="text-sm text-bad">{error}</p> : hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
    </fieldset>
  );
}

/** Selectable card used for radios and checkboxes. */
export function ChoiceCard({ children, checked, className }: { children: ReactNode; checked: boolean; className?: string }) {
  return (
    <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
      checked ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2", className)}>
      {children}
    </label>
  );
}
