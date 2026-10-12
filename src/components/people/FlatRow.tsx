import Link from "next/link";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { PersonLine } from "./PersonLine";
import type { DirRow, UnitLite } from "./types";

/** One flat: its label (a link to the flat page) and the people in it. Used inside `ul.divide-y`. */
export function FlatRow({ unit, people, badges, href, empty = "No one listed yet" }: {
  unit: Pick<UnitLite, "id" | "label">; people: DirRow[]; badges: Record<string, string[]>; href: string; empty?: string;
}) {
  const mine = people.some((p) => p.is_me);
  return (
    <li className={clsx("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:gap-6 sm:px-6", mine && "bg-brand-soft/50")}>
      <div className="flex shrink-0 items-baseline justify-between gap-3 sm:w-28 sm:flex-col sm:justify-start sm:gap-0.5">
        <Link href={href} aria-label={`Flat ${unit.label}`}
          className="group -my-2 inline-flex min-h-10 items-center gap-1 font-medium text-ink no-underline hover:text-brand-text sm:my-0 sm:min-h-0">
          {unit.label}
          <ChevronRight aria-hidden className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
        {mine && <span className="text-sm text-brand-text">Your flat</span>}
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-3.5">
        {people.length === 0
          ? <li className="text-[0.9375rem] text-muted">{empty}</li>
          : people.map((p) => <PersonLine key={`${p.profile_id}-${p.relation}`} p={p} badges={badges[p.profile_id] ?? []} />)}
      </ul>
    </li>
  );
}

/** A thin grey band that names a group of flats ("Floor 3", "Above"). */
export function FlatGroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 border-y border-line bg-surface-2 px-5 py-1.5 text-sm font-medium text-muted sm:px-6">
      {children}
    </h3>
  );
}
