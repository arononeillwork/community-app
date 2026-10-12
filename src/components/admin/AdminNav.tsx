"use client";

import { usePathname } from "next/navigation";
import { TabLinks } from "@/components/ui";

const TABS = [
  { path: "", label: "Overview" },
  { path: "/people", label: "People" },
  { path: "/blocks", label: "Blocks and flats" },
  { path: "/community", label: "Community profile" },
];

/** Sub-navigation shown above every administration page. */
export default function AdminNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/${slug}/admin`;
  return (
    <TabLinks
      label="Administration sections"
      tabs={TABS.map((t) => {
        const href = base + t.path;
        return { href, label: t.label, active: t.path === "" ? path === base : path === href || path.startsWith(href + "/") };
      })}
    />
  );
}
