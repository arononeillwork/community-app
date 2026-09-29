/**
 * Small, pure helpers for invoices (safe to import from server and client code).
 * The approval rule mirrors public.required_approvals() in the database:
 * invoices whose total is above the community threshold need 2 approvals, others 1.
 */

/** Same default as the database function when the community has no threshold set (€1,000). */
export const DEFAULT_APPROVAL_THRESHOLD_CENTS = 100000;

export function approvalThreshold(settings: { invoice_approval_threshold_cents?: number } | null | undefined) {
  const v = Number(settings?.invoice_approval_threshold_cents);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_APPROVAL_THRESHOLD_CENTS;
}

export function requiredApprovals(totalCents: number | null | undefined, thresholdCents: number) {
  return Number(totalCents ?? 0) > thresholdCents ? 2 : 1;
}

export function approvalsText(approvals: number | null | undefined, required: number) {
  return `${Number(approvals ?? 0)} of ${required}`;
}

/** Spanish VAT (IVA) rates offered on the invoice form. */
export const VAT_RATES = [
  { value: "21", label: "21% (standard rate)" },
  { value: "10", label: "10% (reduced rate)" },
  { value: "4", label: "4% (super-reduced rate)" },
  { value: "0", label: "0% (exempt, no VAT)" },
] as const;

export function vatFromNet(netCents: number, ratePercent: number) {
  return Math.round((netCents * ratePercent) / 100);
}

/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD (calendar maths in UTC, no time-zone drift). */
export function addDaysInput(isoDate: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
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

export function isIsoDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
