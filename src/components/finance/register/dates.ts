/**
 * Pure date and contract helpers for the contracts / suppliers / budget / quotes pages.
 * Safe to import from server and client code. Dates are "YYYY-MM-DD" strings; all maths is done
 * in UTC on calendar days, so there is no time-zone drift.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

function utc(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = ISO.exec(d);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(d: string | null | undefined): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = utc(d);
  return t != null && new Date(t).toISOString().slice(0, 10) === d;
}

/** Whole days from `from` to `to` (positive when `to` is later). Null if either date is missing. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = utc(from);
  const b = utc(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

/** Add (or subtract) days from a YYYY-MM-DD date. */
export function addDays(d: string | null | undefined, days: number): string | null {
  const t = utc(d);
  if (t == null) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** "today", "tomorrow", "in 15 days", "yesterday", "15 days ago". */
export function relativeDays(days: number | null | undefined): string {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export type NoticeStatus = "overdue" | "due_soon" | "ok" | "rolling";

/** How many days before the notice deadline we start warning. */
export const NOTICE_WARNING_DAYS = 90;

/**
 * Notice status of a contract:
 * - rolling: no end date (it continues until someone gives notice)
 * - overdue: the notice deadline has passed and the contract has not ended
 * - due_soon: the notice deadline is within 90 days
 * - ok: more than 90 days left
 * Ended or cancelled contracts get null (notice no longer matters).
 */
export function noticeStatus(
  status: string | null | undefined,
  endDate: string | null | undefined,
  deadline: string | null | undefined,
  today: string,
): NoticeStatus | null {
  if (status === "ended" || status === "cancelled") return null;
  if (!endDate) return "rolling";
  const left = daysBetween(today, deadline ?? endDate);
  if (left == null) return null;
  if (left < 0) return "overdue";
  if (left <= NOTICE_WARNING_DAYS) return "due_soon";
  return "ok";
}

export const FREQUENCIES = [
  { value: "monthly", label: "Monthly (every month)", per: "per month" },
  { value: "quarterly", label: "Quarterly (every 3 months)", per: "per quarter" },
  { value: "yearly", label: "Yearly (once a year)", per: "per year" },
  { value: "one_off", label: "One-off (paid once)", per: "one-off" },
] as const;

export type Frequency = (typeof FREQUENCIES)[number]["value"];

export function isFrequency(v: string): v is Frequency {
  return FREQUENCIES.some((f) => f.value === v);
}

export function frequencyPer(v: string | null | undefined) {
  return FREQUENCIES.find((f) => f.value === v)?.per ?? "";
}

/** Same rule as the v_contract_key_dates view: monthly × 12, quarterly × 4, otherwise × 1. */
export function periodsPerYear(freq: string | null | undefined) {
  return freq === "monthly" ? 12 : freq === "quarterly" ? 4 : 1;
}

export function annualCents(amountCents: number | null | undefined, freq: string | null | undefined) {
  return Number(amountCents ?? 0) * periodsPerYear(freq);
}

export function withVat(cents: number, vatRate: number | null | undefined) {
  return Math.round(cents * (1 + Number(vatRate ?? 0) / 100));
}

export const CONTRACT_STATUSES = [
  { value: "active", label: "Active (running now)" },
  { value: "ended", label: "Ended (finished normally)" },
  { value: "cancelled", label: "Cancelled (stopped early)" },
] as const;

/** Budget line status from the share of the budget used. */
export type BudgetStatus = "on_track" | "near_limit" | "over";

export function budgetStatus(budgetCents: number, spentCents: number): BudgetStatus {
  if (budgetCents <= 0) return spentCents > 0 ? "over" : "on_track";
  const pct = (spentCents / budgetCents) * 100;
  if (pct > 100) return "over";
  if (pct >= 90) return "near_limit";
  return "on_track";
}
