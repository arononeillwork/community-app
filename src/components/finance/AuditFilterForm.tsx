"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { SlidersHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui";

type Option = { value: string; label: string };
type Values = { from: string; to: string; area: string; action: string; who: string };

/**
 * Filters for the Audit log. A plain GET form (it works without JavaScript); the database does the filtering,
 * so the results and the export cover the whole log. On phones the fields fold away behind one button.
 */
export default function AuditFilterForm({ values, areas, actions, people, active }: {
  values: Values;
  areas: Option[];
  actions: Option[];
  people: Option[];
  /** Number of filters in use. */
  active: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v) sp.set(k, v);
    router.push(`${pathname}${sp.size ? `?${sp}` : ""}`);
    setOpen(false);
  }

  const select = (id: keyof Values, label: string, options: Option[], all: string) => (
    <div className="field min-w-0">
      <label htmlFor={`audit-${id}`} className="!text-sm !text-muted">{label}</label>
      <select id={`audit-${id}`} name={id} className="input" defaultValue={values[id]}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="no-print mb-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="audit-filters"
        className={clsx(buttonClass("secondary", "md"), "md:hidden")}>
        <SlidersHorizontal aria-hidden className="size-4" />
        {active ? `Filters (${active})` : "Filters"}
      </button>
      {/* key: the fields start from the current filters again after each search. */}
      <form key={JSON.stringify(values)} id="audit-filters" method="get" onSubmit={submit}
        className={clsx("grid-cols-1 gap-3 sm:grid-cols-2 md:mt-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] md:items-end",
          open ? "mt-3 grid" : "hidden")}>
        <div className="field min-w-0">
          <label htmlFor="audit-from" className="!text-sm !text-muted">From</label>
          <input id="audit-from" name="from" type="date" className="input" defaultValue={values.from} />
        </div>
        <div className="field min-w-0">
          <label htmlFor="audit-to" className="!text-sm !text-muted">To</label>
          <input id="audit-to" name="to" type="date" className="input" defaultValue={values.to} />
        </div>
        {select("area", "Area", areas, "All areas")}
        {select("action", "Action", actions, "All actions")}
        {select("who", "Who", people, "Everyone")}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 md:col-[1/-1]">
          <button type="submit" className={buttonClass("primary", "md")}>Apply filters</button>
          {active > 0 && (
            <Link href={pathname} className="inline-flex min-h-10 items-center px-2 text-[0.9375rem] font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
              Clear
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
