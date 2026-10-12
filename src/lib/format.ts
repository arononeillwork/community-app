export function money(cents: number | null | undefined, currency = "EUR", locale = "en-GB") {
  if (cents == null) return "–";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

export function moneyShort(cents: number | null | undefined, currency = "EUR", locale = "en-GB") {
  if (cents == null) return "–";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

/** A calendar date. Date-only strings ("2026-10-05") are shown as written; timestamps in `timeZone`. */
export function date(d: string | Date | null | undefined, timeZone?: string, locale = "en-GB") {
  if (!d) return "–";
  const dateOnly = typeof d === "string" && d.length === 10;
  const v = typeof d === "string" ? new Date(dateOnly ? d + "T00:00:00Z" : d) : d;
  return v.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: dateOnly ? "UTC" : timeZone });
}

export function dateTime(d: string | Date | null | undefined, timeZone = "Europe/Madrid", locale = "en-GB") {
  if (!d) return "–";
  return new Date(d).toLocaleString(locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Parse a user-typed euro amount ("1.234,56", "1234.56", "€ 850") into integer cents. Returns null if invalid. */
export function parseEurosToCents(input: FormDataEntryValue | string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Cents → "1234.56" for pre-filling <input> values. */
export function centsToInput(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/** Today's date as YYYY-MM-DD in the given time zone (for <input type="date"> defaults). */
export function todayInput(timeZone = "Europe/Madrid") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
