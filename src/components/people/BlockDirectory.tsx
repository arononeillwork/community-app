"use client";

import { useId, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Card } from "@/components/ui";
import { FlatGroupHeading, FlatRow } from "./FlatRow";
import { flatKey, floorName, fold, type DirRow, type UnitLite } from "./types";

type Props = {
  blockName: string;
  /** Every flat in the block (so empty flats still appear). */
  units: UnitLite[];
  /** The people in this block, from block_directory. */
  people: DirRow[];
  /** Badges per profile id, already worked out for this block. */
  badges: Record<string, string[]>;
  /** Link prefix for a flat page; the unit id is appended. */
  flatHref: string;
};

/** One block, floor by floor (top floor first, like the building), with a name / flat search. */
export default function BlockDirectory({ blockName, units, people, badges, flatHref }: Props) {
  const [q, setQ] = useState("");
  const inputId = useId();

  const flats = useMemo(() => {
    const byUnit = new Map<string, DirRow[]>();
    for (const p of people) byUnit.set(p.unit_id, [...(byUnit.get(p.unit_id) ?? []), p]);
    return [...units]
      .sort((a, b) => (b.floor ?? -999) - (a.floor ?? -999) || a.label.localeCompare(b.label, "en", { numeric: true }))
      .map((u) => ({ unit: u, people: byUnit.get(u.id) ?? [] }));
  }, [units, people]);

  const needle = fold(q.trim());
  const flatNeedle = flatKey(q);
  const shown = needle
    ? flats.filter(({ unit, people: ps }) =>
        (flatNeedle && flatKey(unit.label).includes(flatNeedle))
        || ps.some((p) => fold(p.full_name).includes(needle) || (badges[p.profile_id] ?? []).some((b) => fold(b).includes(needle))))
    : flats;

  const floors: { floor: number | null; flats: typeof shown }[] = [];
  for (const f of shown) {
    const last = floors[floors.length - 1];
    if (last && last.floor === f.unit.floor) last.flats.push(f);
    else floors.push({ floor: f.unit.floor, flats: [f] });
  }

  const peopleCount = new Set(people.map((p) => p.profile_id)).size;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] font-semibold leading-snug">{blockName}</h2>
          <p className="mt-0.5 text-[0.9375rem] text-muted">
            {units.length} {units.length === 1 ? "flat" : "flats"} · {peopleCount} {peopleCount === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="field w-full sm:max-w-xs">
          <label htmlFor={inputId} className="!text-sm !text-muted">Find a name or flat</label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted" />
            <input id={inputId} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name or flat, e.g. 3B" className="input pl-10" autoComplete="off" />
          </div>
        </div>
      </div>

      {/* Always mounted, so screen readers announce the count as it changes. */}
      <p className="sr-only" aria-live="polite">
        {needle ? `${shown.length} ${shown.length === 1 ? "flat" : "flats"} found` : ""}
      </p>

      {floors.length === 0 ? (
        <div className="flex flex-col items-center border-t border-line px-6 py-10 text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
            <SearchX aria-hidden className="size-5" />
          </span>
          <p className="font-medium">{needle ? `No one matches “${q.trim()}”` : "No flats in this block yet"}</p>
          {needle && (
            <button type="button" onClick={() => setQ("")} className="mt-2 text-[0.9375rem] font-medium text-brand-text underline-offset-4 hover:underline">
              Clear the search
            </button>
          )}
        </div>
      ) : (
        floors.map((fl) => (
          <section key={String(fl.floor)} aria-label={floorName(fl.floor)}>
            <FlatGroupHeading>{floorName(fl.floor)}</FlatGroupHeading>
            <ul className="divide-y divide-line">
              {fl.flats.map(({ unit, people: ps }) => (
                <FlatRow key={unit.id} unit={unit} people={ps} badges={badges} href={`${flatHref}${unit.id}`} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Card>
  );
}
