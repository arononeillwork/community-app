/* Relative times and day grouping for notifications. Pure functions, safe on server and client. */

const RTF = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** Calendar day (YYYY-MM-DD) of a moment in a time zone. */
export function dayKey(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago", then a date. */
export function relativeTime(iso: string, timeZone: string, now = new Date()) {
  const d = new Date(iso);
  const secs = Math.round((now.getTime() - d.getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return RTF.format(-Math.floor(secs / 60), "minute");
  const days = daysBetween(dayKey(d, timeZone), dayKey(now, timeZone));
  if (days <= 0) return RTF.format(-Math.floor(secs / 3600), "hour");
  if (days === 1) return "Yesterday";
  if (days < 7) return RTF.format(-days, "day");
  const sameYear = dayKey(d, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone });
}

export type DayGroup = "today" | "week" | "older";

/** Today, the six days before it, or older. */
export function dayGroup(iso: string, timeZone: string, now = new Date()): DayGroup {
  const days = daysBetween(dayKey(new Date(iso), timeZone), dayKey(now, timeZone));
  if (days <= 0) return "today";
  if (days < 7) return "week";
  return "older";
}
