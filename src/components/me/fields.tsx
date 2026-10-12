import clsx from "clsx";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/* Form pieces for settings-style forms. No client JS needed: state comes from the native inputs
   and the :checked / :focus-visible styles. */

/** A selectable card (radio or checkbox) with an optional icon and a one-line description. */
export function ChoiceCard({ name, value, label, description, icon: Icon, defaultChecked, checked, onChange, type = "radio", disabled, className }: {
  name: string; value: string; label: ReactNode; description?: ReactNode; icon?: LucideIcon;
  defaultChecked?: boolean; checked?: boolean; onChange?: () => void; type?: "radio" | "checkbox"; disabled?: boolean; className?: string;
}) {
  return (
    <label className={clsx(
      "relative flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:bg-surface-2",
      "has-[:checked]:border-brand has-[:checked]:bg-brand-soft",
      disabled && "cursor-not-allowed opacity-55",
      className,
    )}>
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} checked={checked} onChange={onChange} disabled={disabled}
        className="mt-1 size-[1.15rem] shrink-0 accent-[var(--brand)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2 font-medium text-ink">
          {Icon && <Icon aria-hidden className="mt-[0.2em] size-4 shrink-0 text-muted" />}
          <span className="min-w-0 [overflow-wrap:break-word]">{label}</span>
        </span>
        {description && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted [overflow-wrap:break-word]">{description}</span>}
      </span>
    </label>
  );
}

/** An on/off switch with a label and a short description. The whole row is the tap target. */
export function Toggle({ name, label, description, defaultChecked }: {
  name: string; label: ReactNode; description?: ReactNode; defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {description && <span className="block text-[0.9375rem] leading-snug text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span aria-hidden className={clsx(
          "h-7 w-12 rounded-full bg-line-strong/45 transition-colors peer-checked:bg-brand",
          "peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--focus)]",
        )} />
        <span aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-card transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Groups fields under a quiet label, used inside a card. */
export function FieldGroup({ legend, hint, children, className }: { legend: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={clsx("min-w-0", className)}>
      <legend className="mb-1 text-[0.9375rem] font-medium text-ink">{legend}</legend>
      {hint && <p className="hint -mt-0.5 mb-2.5">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {children}
    </fieldset>
  );
}
