"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, DoorOpen, Search, UserRound } from "lucide-react";
import { Card } from "@/components/ui";
import { flatKey, fold } from "./types";

/** One thing the finder can jump to: a flat (any block), or a member who is not linked to a flat. */
export type FinderItem = {
  href: string;
  kind: "flat" | "person";
  /** Flat label ("B-3C") or the person's name. */
  title: string;
  /** "Block B · Floor 3", or the person's roles. */
  where: string;
  /** Who lives in the flat, e.g. "Lucía García (owner)"; for a member without a flat, just them (so their phone matches). */
  people: { name: string; relation: string; digits: string }[];
};

const MAX = 8;

/**
 * Administrators: one box that finds a flat or a person in any block. "B-3C", "b3c" and "3C" find flats by label,
 * a name finds the flats that person lives in, and four or more digits match a phone number.
 * Enter opens the first match.
 */
export default function MemberFinder({ items }: { items: FinderItem[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const inputId = useId();
  const listId = useId();

  const needle = fold(q.trim());
  const key = flatKey(q);
  const digits = q.replace(/\D/g, "");

  const matches = useMemo(() => {
    if (!needle) return [];
    const scored: { item: FinderItem; score: number; who: FinderItem["people"] }[] = [];
    for (const item of items) {
      let score = Infinity;
      if (item.kind === "flat" && key) {
        const label = flatKey(item.title);
        if (label === key) score = 0;
        else if (label.endsWith(key)) score = 1;
        else if (label.includes(key)) score = 2;
      }
      if (item.kind === "person" && fold(item.title).includes(needle)) score = Math.min(score, 3);
      const who = item.people.filter((p) => fold(p.name).includes(needle) || (digits.length >= 4 && p.digits.includes(digits)));
      if (who.length) score = Math.min(score, 3);
      if (score < Infinity) scored.push({ item, score, who });
    }
    return scored.sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title, "en", { numeric: true }));
  }, [items, needle, key, digits]);

  const shown = matches.slice(0, MAX);

  function open(e: FormEvent) {
    e.preventDefault();
    if (shown[0]) router.push(shown[0].item.href);
  }

  return (
    <Card className="mb-6">
      <form role="search" onSubmit={open}>
        <div className="field">
          <label htmlFor={inputId}>Find a flat or person in any block</label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted" />
            <input id={inputId} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="input pl-10"
              placeholder="e.g. B-3C, 3C or a name" autoComplete="off" enterKeyHint="go"
              aria-controls={listId} aria-describedby={`${inputId}-hint`} />
          </div>
          <p id={`${inputId}-hint`} className="hint">Press Enter to open the first match.</p>
        </div>
      </form>

      {/* Always mounted, so screen readers announce the count as it changes. */}
      <p className="sr-only" aria-live="polite">
        {needle ? (matches.length ? `${matches.length} found` : "Nothing found") : ""}
      </p>

      <div id={listId}>
        {needle && (shown.length ? (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {shown.map(({ item, who }) => {
              const Icon = item.kind === "flat" ? DoorOpen : UserRound;
              // A name search lists the people it matched first; a flat search lists everyone in the flat.
              const listed = who.length ? who : item.people;
              const rest = item.people.length - listed.length;
              const names = item.kind === "person" ? ""
                : listed.length ? listed.map((p) => `${p.name} (${p.relation})`).join(", ") + (rest > 0 ? ` and ${rest} more` : "")
                : "No one linked yet";
              return (
                <li key={item.href}>
                  <Link href={item.href} className="group flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                      <Icon aria-hidden className="size-[1.1rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium group-hover:underline">{item.kind === "flat" ? `Flat ${item.title}` : item.title}</span>
                      <span className="block text-sm text-muted">{[item.where, names].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-[0.9375rem] text-muted">No flat or person matches “{q.trim()}”.</p>
        ))}
        {matches.length > MAX && (
          <p className="mt-2 text-sm text-muted">{matches.length - MAX} more. Type more of the flat or name to narrow it down.</p>
        )}
      </div>
    </Card>
  );
}
