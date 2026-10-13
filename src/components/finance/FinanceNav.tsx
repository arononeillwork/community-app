"use client";

import { usePathname } from "next/navigation";
import { TabLinks } from "@/components/ui";

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

/** Sub-navigation shown at the top of every finance page (same pill tabs as the rest of the app). */
export default function FinanceNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/${slug}/finance`;
  return (
    <TabLinks label="Finance sections" tabs={TABS.map((t) => {
      const href = base + t.path;
      return { href, label: t.label, active: t.path === "" ? path === base : path === href || path.startsWith(href + "/") };
    })} />
  );
}
