import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * First row of every page inside Finance: a short section title on the left, actions on the right.
 * The Finance layout already shows the page title and tabs, so pages never repeat a PageHeader.
 */
export default function FinanceToolbar({ title, meta, actions, back, as: As = "h2" }: {
  title: ReactNode;
  /** One short line under the title (supplier, dates…). */
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-5 flex flex-col gap-2">
      {back && (
        <Link href={back.href}
          className="no-print -ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-0.5 text-[0.9375rem] font-medium text-muted no-underline hover:text-ink">
          <ChevronLeft aria-hidden className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <As className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.0625rem] font-semibold leading-snug">{title}</As>
          {meta && <div className="mt-0.5 text-[0.9375rem] text-muted">{meta}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
