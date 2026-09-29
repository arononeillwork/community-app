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
    <nav aria-label="Finance sections" className="no-print mb-6 flex gap-2 overflow-x-auto border-b-2 border-line pb-2">
      {TABS.map((t) => {
        const href = base + t.path;
        const on = t.path === "" ? path === base : path === href || path.startsWith(href + "/");
        return (
          <Link key={t.label} href={href} aria-current={on ? "page" : undefined}
            className={clsx("whitespace-nowrap rounded-lg px-4 py-2 font-bold no-underline",
              on ? "bg-ink text-surface" : "bg-surface text-ink hover:bg-bg border border-line")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
