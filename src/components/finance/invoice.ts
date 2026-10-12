/* Invoice rules shared by the invoice pages, forms and server actions (no server-only imports). */

export const VAT_RATES = [21, 10, 4, 0] as const;

export const DEFAULT_APPROVAL_THRESHOLD_CENTS = 100000;

/** Same rule as public.required_approvals(): above the threshold an invoice needs a second approver. */
export function requiredApprovals(totalCents: number, thresholdCents: number | null | undefined) {
  return totalCents > (thresholdCents ?? DEFAULT_APPROVAL_THRESHOLD_CENTS) ? 2 : 1;
}

export function vatFor(netCents: number, rate: number) {
  return Math.round((netCents * rate) / 100);
}

/** Closest standard Spanish VAT rate for an existing invoice (for pre-filling the edit form). */
export function guessVatRate(netCents: number, vatCents: number) {
  if (netCents <= 0) return 21;
  const pct = (vatCents / netCents) * 100;
  return VAT_RATES.reduce((best, r) => (Math.abs(r - pct) < Math.abs(best - pct) ? r : best), 21 as number);
}

/** File name safe for a storage path: lower case, ASCII letters, digits, dots and dashes. */
export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "invoice";
  return ext ? `${stem}.${ext}` : stem;
}

/** The original file name shown to people: storage paths are "<community>/invoices/<uuid>-<name>". */
export function attachmentName(path: string | null | undefined) {
  if (!path) return "";
  const last = path.split("/").pop() ?? "";
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
}

export const ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
