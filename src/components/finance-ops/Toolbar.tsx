import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * First row of a finance page (the Finance layout already shows the page title and tabs):
 * a short section title on the left, actions on the right, optional back link above.
 */
export function Toolbar({ title, description, actions, back, badge }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  badge?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2">
      {back && (
        <Link href={back.href} className="no-print -ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-1 text-[0.9375rem] font-medium text-muted no-underline hover:text-ink">
          <ChevronLeft aria-hidden className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.0625rem] font-semibold leading-snug">{title}</h2>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-[0.9375rem] text-muted">{description}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
