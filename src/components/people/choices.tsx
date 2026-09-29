import clsx from "clsx";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Large, tappable radio option. The whole card is the label, so tapping anywhere selects it.
 * The chosen card is shown with colour AND the word "Chosen".
 */
export function RadioCard({ name, value, checked, onChange, title, description, children, disabled }: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={clsx(
        "flex min-h-14 cursor-pointer items-start gap-4 rounded-xl border-2 p-4",
        checked ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 size-7 shrink-0 accent-[var(--brand)]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-bold">{title}</span>
          {checked && (
            // The radio itself tells screen readers it is selected, so this word is for sighted users.
            <span aria-hidden className="inline-flex items-center gap-1 rounded-full border border-brand bg-surface px-3 py-0.5 text-sm font-bold text-ink">
              <Check aria-hidden className="size-4" /> Chosen
            </span>
          )}
        </span>
        {description && <span className="text-muted">{description}</span>}
        {children}
      </span>
    </label>
  );
}

/**
 * Large on/off choice: a big checkbox with its label text and an "On"/"Off" word.
 * No tiny switches.
 */
export function ToggleCard({ name, checked, onChange, title, description }: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      className={clsx(
        "flex min-h-14 cursor-pointer items-start gap-4 rounded-xl border-2 p-4",
        checked ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-7 shrink-0 accent-[var(--brand)]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-bold">{title}</span>
          <span
            aria-hidden
            className={clsx(
              "rounded-full border px-3 py-0.5 text-sm font-bold",
              checked ? "border-brand bg-surface text-ink" : "border-line bg-bg text-muted",
            )}
          >
            {checked ? "On" : "Off"}
          </span>
        </span>
        {description && <span className="text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** Save button for a settings section: full width, very large, shows progress. */
export function SaveButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-16 w-full rounded-xl bg-brand px-6 text-xl font-bold text-brand-ink hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
