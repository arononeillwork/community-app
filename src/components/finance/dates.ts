/* Dates for finance pages, always in the community's time zone (the server runs in UTC). */

/** "12 Oct 2026" for a timestamp, as the community's calendar shows it. */
export function dayOf(at: string | null | undefined, timeZone = "Europe/Madrid") {
  if (!at) return "–";
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
}

/** A timestamp's calendar day as YYYY-MM-DD in the community's time zone (for sorting and date filters). */
export function isoDayOf(at: string, timeZone = "Europe/Madrid") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(at));
}

/** An unpaid invoice is overdue once its due date has passed in the community's time zone. */
export function isOverdue(status: string, dueDate: string | null | undefined, today: string) {
  return (status === "received" || status === "approved") && !!dueDate && dueDate < today;
}

/** True for a real calendar day written as YYYY-MM-DD. */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The day after a YYYY-MM-DD day. */
export function nextIsoDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The moment a calendar day starts in the community's time zone, as a UTC ISO timestamp (for filtering timestamps by day). */
export function dayStartUtc(day: string, timeZone = "Europe/Madrid") {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  // How far the zone's wall clock is ahead of UTC at a given moment.
  const offset = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  const midnight = Date.parse(`${day}T00:00:00Z`);
  // Second pass settles days on which the clocks change.
  const t = midnight - offset(midnight - offset(midnight));
  return new Date(t).toISOString();
}
