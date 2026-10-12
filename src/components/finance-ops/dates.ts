/* Date and money helpers shared by the contracts, budget, fees and quotes pages.
   All dates here are plain calendar dates ("YYYY-MM-DD"), compared in UTC so time zones never shift a day. */

const DAY = 86_400_000;

function utc(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  return Math.round((utc(to) - utc(from)) / DAY);
}

/** "today", "tomorrow", "in 23 days", "yesterday", "23 days ago". */
export function relativeDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Add days to a calendar date. */
export function addDays(d: string, n: number) {
  return new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
}

/** Add whole months to a calendar date, clamping to the end of shorter months. */
export function addMonths(d: string, n: number) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** Whole months between two dates (the same rule as the contracts view). */
export function monthsBetween(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

export function isDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(utc(v));
}

export const FREQUENCIES = [
  { value: "monthly", label: "Monthly", perYear: 12 },
  { value: "quarterly", label: "Quarterly", perYear: 4 },
  { value: "yearly", label: "Yearly", perYear: 1 },
  { value: "one_off", label: "One-off", perYear: 1 },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export function frequencyLabel(v: string | null | undefined) {
  return FREQUENCIES.find((f) => f.value === v)?.label ?? "";
}

/** "a month", "a quarter", "a year", "once". */
export function perPeriod(v: string | null | undefined) {
  return v === "monthly" ? "a month" : v === "quarterly" ? "a quarter" : v === "yearly" ? "a year" : "once";
}

export function lengthLabel(months: number | null | undefined) {
  if (months == null) return "Rolling";
  if (months > 0 && months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

export const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

export function methodLabel(v: string | null | undefined) {
  return METHODS.find((m) => m.value === v)?.label ?? "";
}

/** Safe storage file name: keeps letters, digits, dot, dash and underscore. */
export function safeFileName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^-|-$/g, "").slice(-80) || "file";
}

/** The file name a person uploaded, without the "<uuid>-" prefix we add in storage. */
export function displayFileName(path: string | null | undefined) {
  if (!path) return "";
  const base = path.split("/").pop() ?? path;
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
}

/** Stable anchor id for a quote job title, e.g. "job-roof-waterproofing-block-c". */
export function jobAnchor(title: string) {
  return "job-" + (title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job");
}
