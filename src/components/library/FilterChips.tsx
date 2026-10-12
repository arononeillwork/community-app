import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Pill links for filtering a list through URL parameters (they work without JavaScript).
 * Phones: one row that scrolls sideways. Wider screens: the pills wrap, followed by `after` (e.g. a toggle).
 */
export function FilterChips({ label, chips, className, after }: {
  label: string;
  chips: { href: string; label: string; active: boolean; count?: number; icon?: LucideIcon }[];
  className?: string;
  after?: ReactNode;
}) {
  return (
    <nav aria-label={label} className={clsx("no-print -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-quiet sm:flex-wrap sm:overflow-visible", className)}>
      {chips.map((c) => (
        <Link key={c.href} href={c.href} aria-current={c.active ? "page" : undefined} scroll={false}
          className={clsx("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] font-medium no-underline transition-colors",
            c.active ? "bg-ink text-surface" : "bg-surface text-ink-2 ring-1 ring-inset ring-line hover:text-ink")}>
          {c.icon && <c.icon aria-hidden className="size-4" />}
          {c.label}
          {c.count != null && (
            <span className={clsx("rounded-full px-1.5 text-xs tabular", c.active ? "bg-surface/20" : "bg-surface-2 text-muted ring-1 ring-line")}>{c.count}</span>
          )}
        </Link>
      ))}
      {after}
    </nav>
  );
}
