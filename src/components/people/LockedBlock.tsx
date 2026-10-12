import { Lock } from "lucide-react";
import type { BlockInfo } from "./types";

/** A block the viewer does not live in: its size only, never its people. */
export function LockedBlock({ b }: { b: BlockInfo }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface text-muted ring-1 ring-inset ring-line">
        <Lock aria-hidden className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="font-medium text-ink-2">{b.building_name}</div>
        <div className="text-sm text-muted">
          {b.units} {b.units === 1 ? "flat" : "flats"} · {b.people} {b.people === 1 ? "person" : "people"}
        </div>
        <p className="mt-1 text-sm text-muted">Only residents of {b.building_name} can see this list.</p>
      </div>
    </li>
  );
}
