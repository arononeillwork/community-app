"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { path: "", label: "Overview" },
  { path: "/people", label: "People & flats" },
  { path: "/settings", label: "Community settings" },
];

/** Sub-navigation shown at the top of every administration page. */
export default function AdminNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/${slug}/admin`;
  return (
    <nav aria-label="Administration sections" className="no-print mb-6 flex gap-2 overflow-x-auto border-b-2 border-line pb-2">
      {TABS.map((t) => {
        const href = base + t.path;
        const on = t.path === "" ? path === base : path === href || path.startsWith(href + "/");
        return (
          <Link key={t.label} href={href} aria-current={on ? "page" : undefined}
            className={clsx("inline-flex min-h-12 items-center whitespace-nowrap rounded-lg px-4 py-2 font-bold no-underline",
              on ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-bg")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
