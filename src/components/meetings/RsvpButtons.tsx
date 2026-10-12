"use client";

import { useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, Users, Video, X, type LucideIcon } from "lucide-react";
import { RSVP_OPTIONS, type RsvpResponse } from "./meeting-utils";

const ICONS: Record<RsvpResponse, LucideIcon> = { attending: Users, online: Video, not_attending: X };

type Counts = Record<RsvpResponse, number>;

/** Three toggle buttons (one pressed) plus live counts. Updates optimistically; the server action re-validates. */
export function RsvpButtons({ current, counts, action, open, hasLink }: {
  current: RsvpResponse | null;
  counts: Counts;
  action: (response: RsvpResponse) => Promise<{ error?: string }>;
  /** False once the meeting has taken place or was cancelled. */
  open: boolean;
  /** Whether "Joining online" makes sense (the meeting has a link). */
  hasLink: boolean;
}) {
  const [mine, setMine] = useOptimistic(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Counts follow the optimistic choice so the numbers move as soon as you tap.
  const shown: Counts = { ...counts };
  if (current) shown[current] -= 1;
  if (mine) shown[mine] += 1;

  function choose(r: RsvpResponse) {
    if (!open || r === mine) return;
    setError(null);
    start(async () => {
      setMine(r);
      const res = await action(r);
      if (res?.error) setError(res.error);
    });
  }

  const options = RSVP_OPTIONS.filter((o) => o.value !== "online" || hasLink || counts.online > 0);

  return (
    <div className="flex flex-col gap-4">
      {open ? (
        <div role="group" aria-label="Your reply" className="flex flex-col gap-2">
          {options.map((o) => {
            const Icon = ICONS[o.value];
            const pressed = mine === o.value;
            return (
              <button key={o.value} type="button" aria-pressed={pressed} disabled={pending && !pressed}
                onClick={() => choose(o.value)}
                className={clsx(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 text-left text-[0.9375rem] font-medium transition-colors disabled:opacity-60",
                  pressed ? "border-brand bg-brand-soft text-brand-text" : "border-line bg-surface text-ink hover:bg-surface-2",
                )}>
                <Icon aria-hidden className="size-[1.15rem] shrink-0" />
                <span className="flex-1">{o.label}</span>
                {pressed && <Check aria-hidden className="size-[1.15rem] shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : mine ? (
        <p className="text-[0.9375rem] text-ink-2">You replied: <span className="font-medium text-ink">{RSVP_OPTIONS.find((o) => o.value === mine)?.label}</span></p>
      ) : null}

      {error && <p role="alert" className="text-[0.9375rem] text-bad">{error}</p>}

      <dl className={clsx("grid gap-2 text-center", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((o) => (
          <div key={o.value} className="rounded-xl bg-surface-2 px-2 py-2.5">
            <dt className="text-xs text-muted">{o.short}</dt>
            <dd className="mt-0.5 text-xl font-semibold leading-none tabular">{shown[o.value]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
