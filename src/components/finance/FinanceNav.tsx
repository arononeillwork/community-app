"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { path: "", label: "Overview" },
  { path: "/invoices", label: "Invoices" },
  { path: "/contracts", label: "Contracts" },
  { path: "/suppliers", label: "Suppliers" },
  { path: "/budget", label: "Budget" },
  { path: "/fees", label: "Owner fees" },
  { path: "/quotes", label: "Quotes" },
  { path: "/audit", label: "Audit log" },
];

/** Sub-navigation shown at the top of every finance page. */
export default function FinanceNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/${slug}/finance`;
  return (
    <nav aria-label="Finance sections" className="no-print scroll-quiet -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1 max-md:pr-8 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]">
      {TABS.map((t) => {
        const href = base + t.path;
        const on = t.path === "" ? path === base : path === href || path.startsWith(href + "/");
        return (
          <Link key={t.label} href={href} aria-current={on ? "page" : undefined}
            className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[0.9375rem] font-medium no-underline transition-colors",
              on ? "border-brand text-ink" : "border-transparent text-muted hover:border-line-strong/50 hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
