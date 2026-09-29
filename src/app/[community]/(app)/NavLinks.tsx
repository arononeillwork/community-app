"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="no-print mx-auto hidden max-w-7xl gap-1 overflow-x-auto px-3 pb-2 sm:flex">
      {links.map((l) => {
        const on = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={clsx("whitespace-nowrap rounded-lg px-3 py-2 font-bold no-underline",
              on ? "bg-brand text-brand-ink" : "text-ink hover:bg-bg")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
