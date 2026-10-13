import clsx from "clsx";
import { inZone } from "./meeting-utils";

/** Calendar-style month + day tile, in the community's time zone (same look as the home page). */
export function DateTile({ date, timeZone, size = "md", muted = false, className }: {
  date: string; timeZone: string; size?: "sm" | "md" | "lg"; muted?: boolean; className?: string;
}) {
  return (
    <div aria-hidden className={clsx(
      "flex shrink-0 flex-col items-center justify-center self-start rounded-xl border border-line bg-surface-2",
      size === "sm" && "w-12 py-1",
      size === "md" && "w-14 py-1.5",
      size === "lg" && "w-16 py-2",
      muted && "opacity-60",
      className,
    )}>
      <span className={clsx("text-xs font-medium uppercase tracking-wide", muted ? "text-muted" : "text-brand-text")}>
        {inZone(date, timeZone, { month: "short" }).slice(0, 3)}
      </span>
      <span className={clsx("font-semibold leading-tight tabular", size === "sm" ? "text-lg" : size === "lg" ? "text-2xl" : "text-xl")}>
        {inZone(date, timeZone, { day: "numeric" })}
      </span>
    </div>
  );
}
