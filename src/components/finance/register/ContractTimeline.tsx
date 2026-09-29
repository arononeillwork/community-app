import clsx from "clsx";
import { date } from "@/lib/format";
import { addDays, daysBetween, relativeDays } from "./dates";

type Props = {
  start: string;
  end: string | null;
  deadline: string | null;
  today: string;
  noticeDays: number;
  ended: boolean;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Visual line of the key dates: start → notice deadline → end, with a "Today" marker.
 * The bar is decorative (aria-hidden); the list below it says the same thing in words.
 */
export default function ContractTimeline({ start, end, deadline, today, noticeDays, ended }: Props) {
  if (!end) {
    const earliestEnd = addDays(today, noticeDays);
    return (
      <div className="flex flex-col gap-4">
        <div aria-hidden className="relative mt-8 h-4 rounded-full bg-gradient-to-r from-ok-soft via-ok-soft to-transparent">
          <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-ink" />
          <Marker pct={65} label="Today" />
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          <Point label="Started" when={date(start)} words={relativeDays(daysBetween(today, start))} />
          <Point label="End date" when="No end date" words="Rolling contract: it continues until someone gives notice." />
          {!ended && (
            <Point label="If you gave notice today" when={date(earliestEnd)}
              words={`It could end on this date (${noticeDays} days' notice).`} tone="info" />
          )}
        </ol>
      </div>
    );
  }

  const total = daysBetween(start, end) || 1;
  const pos = (d: string | null) => (d ? clamp(((daysBetween(start, d) ?? 0) / total) * 100) : 0);
  const pDeadline = pos(deadline);
  const pToday = pos(today);
  const toDeadline = daysBetween(today, deadline);
  const toEnd = daysBetween(today, end);
  const beforeStart = (daysBetween(start, today) ?? 0) < 0;
  const afterEnd = (toEnd ?? 0) < 0;

  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="relative mt-8 h-4 rounded-full bg-line">
        {/* Time when notice can still be given, then the "too late" part */}
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-ok/70" style={{ width: `${pDeadline}%` }} />
        <div className="absolute inset-y-0 rounded-r-full bg-warn/70" style={{ left: `${pDeadline}%`, right: 0 }} />
        <div className="absolute -inset-y-1 left-0 w-1 rounded-full bg-ink" />
        <div className="absolute -inset-y-1 w-1 rounded-full bg-ink" style={{ left: `calc(${pDeadline}% - 2px)` }} />
        <div className="absolute -inset-y-1 right-0 w-1 rounded-full bg-ink" />
        {!ended && <Marker pct={pToday} label={beforeStart ? "Today (not started)" : afterEnd ? "Today (after the end)" : "Today"} />}
      </div>
      <div aria-hidden className="flex flex-wrap gap-4 text-sm text-muted">
        <span className="inline-flex items-center gap-2"><span className="inline-block size-4 rounded bg-ok/70" /> You can still give notice</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block size-4 rounded bg-warn/70" /> Too late to give notice for this end date</span>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        <Point label="Start" when={date(start)} words={relativeDays(daysBetween(today, start))} />
        <Point label="Notice deadline" when={date(deadline)}
          words={ended ? "" : toDeadline == null ? "" : toDeadline >= 0 ? `Notice deadline ${relativeDays(toDeadline)}` : `Passed ${-toDeadline} days ago`}
          tone={ended ? undefined : toDeadline == null ? undefined : toDeadline < 0 ? "bad" : toDeadline <= 90 ? "warn" : "ok"} />
        <Point label="End" when={date(end)} words={ended ? "" : toEnd == null ? "" : toEnd >= 0 ? `Ends ${relativeDays(toEnd)}` : `Ended ${-toEnd} days ago`} />
      </ol>
    </div>
  );
}

function Marker({ pct, label }: { pct: number; label: string }) {
  // Keep the label inside the bar's width.
  const left = Math.min(92, Math.max(8, pct));
  return (
    <>
      <div className="absolute -inset-y-2 w-1.5 rounded-full bg-brand" style={{ left: `calc(${pct}% - 3px)` }} />
      <div className="absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-md bg-brand px-2 text-sm font-bold text-brand-ink" style={{ left: `${left}%` }}>
        {label}
      </div>
    </>
  );
}

function Point({ label, when, words, tone }: { label: string; when: string; words?: string; tone?: "ok" | "warn" | "bad" | "info" }) {
  return (
    <li className={clsx("rounded-xl border-2 p-4",
      tone === "bad" ? "border-bad/40 bg-bad-soft" : tone === "warn" ? "border-warn/40 bg-warn-soft" : tone === "ok" ? "border-ok/30 bg-ok-soft" : tone === "info" ? "border-info/30 bg-info-soft" : "border-line bg-bg")}>
      <div className="text-sm font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-xl font-bold">{when}</div>
      {words && <div className={clsx("font-bold", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{words}</div>}
    </li>
  );
}
