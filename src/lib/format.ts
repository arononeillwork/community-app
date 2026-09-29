export function money(cents: number | null | undefined, currency = "EUR", locale = "en-GB") {
  if (cents == null) return "–";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

export function moneyShort(cents: number | null | undefined, currency = "EUR", locale = "en-GB") {
  if (cents == null) return "–";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function date(d: string | Date | null | undefined, locale = "en-GB") {
  if (!d) return "–";
  const v = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return v.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
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
