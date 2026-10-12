import Link from "next/link";
import clsx from "clsx";

/** Saved views above a finance table: links (bookmarkable). One scrolling row on phones, wrapping on larger screens. */
export default function ViewPills({ views, label }: { views: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-print scroll-quiet -mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
      {views.map((v) => (
        <Link key={v.href} href={v.href} aria-current={v.active ? "page" : undefined}
          className={clsx("inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[0.9375rem] font-medium no-underline transition-colors",
            v.active ? "bg-ink text-surface" : "bg-surface text-ink-2 ring-1 ring-inset ring-line hover:text-ink")}>
          {v.label}
          {v.count != null && (
            <span className={clsx("rounded-full px-1.5 text-xs tabular", v.active ? "bg-surface/20" : "bg-surface-2 text-muted")}>{v.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
