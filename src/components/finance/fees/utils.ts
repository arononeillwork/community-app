/**
 * Small, pure helpers for the owner-fees pages (safe to import from server and client code).
 */

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const REMINDER_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "letter", label: "Letter" },
  { value: "phone", label: "Phone call" },
] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]["value"];

/** one_off is left out on purpose: a yearly schedule already covers "once a year". */
export const FREQUENCIES = [
  { value: "monthly", label: "Monthly (12 payments a year)", short: "Monthly", periods: 12, per: "month" },
  { value: "quarterly", label: "Quarterly (4 payments a year)", short: "Quarterly", periods: 4, per: "quarter" },
  { value: "yearly", label: "Yearly (1 payment a year)", short: "Yearly", periods: 1, per: "year" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export function methodLabel(v: string | null | undefined) {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? humanizeWord(v);
}

export function channelLabel(v: string | null | undefined) {
  return REMINDER_CHANNELS.find((c) => c.value === v)?.label ?? humanizeWord(v);
}

export function frequencyInfo(v: string | null | undefined) {
  return FREQUENCIES.find((f) => f.value === v) ?? { value: v ?? "", label: humanizeWord(v), short: humanizeWord(v), periods: 1, per: "year" };
}

export function humanizeWord(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Whole days from a to b (both YYYY-MM-DD). Positive when b is later. */
export function daysBetween(a: string, b: string) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a);
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86400000);
}

/** Add days to a YYYY-MM-DD date (calendar maths in UTC, so no time-zone drift). */
export function addDays(isoDate: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)).toISOString().slice(0, 10);
}

/** The calendar date (YYYY-MM-DD) of a timestamp in the community's time zone. */
export function dateInZone(iso: string | null | undefined, timeZone: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
}

/** The clock time (HH:MM, 24-hour) of a timestamp in the community's time zone. */
export function timeInZone(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Uppercase, accents removed, apostrophes dropped: "O'Brien" -> "OBRIEN", "Chloé" -> "CHLOE". */
export function foldText(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").toUpperCase();
}

/** Last word of a full name, used to recognise a surname in a bank description. */
export function surnameOf(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const last = foldText(words[words.length - 1]).replace(/[^A-Z0-9-]/g, "");
  return last.length >= 3 ? last : null;
}
