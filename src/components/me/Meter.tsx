import clsx from "clsx";

/**
 * A thin progress bar: how much of a limit is used. Pure CSS.
 * The track is a lighter step of the fill's colour; over the limit the whole bar turns to the warn tone.
 * The numbers are always written next to it, so the bar itself is hidden from screen readers.
 */
export function Meter({ value, max, className, title }: { value: number; max: number; className?: string; title?: string }) {
  const over = max > 0 && value > max;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return (
    <div aria-hidden title={title} className={clsx("h-2 w-full overflow-hidden rounded-full [html.hc_&]:ring-1 [html.hc_&]:ring-line", over ? "bg-warn-soft ring-1 ring-inset ring-warn/25" : "bg-brand-soft", className)}>
      <div className={clsx("h-full rounded-full", over ? "bg-warn" : "bg-brand")} style={{ width: `${pct}%` }} />
    </div>
  );
}
