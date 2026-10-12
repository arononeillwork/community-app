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
