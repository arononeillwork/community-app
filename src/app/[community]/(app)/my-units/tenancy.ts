/* Shared by the "My flat" pages and their server actions. */

export const TENANCY_TYPES = [
  { value: "long_term", label: "Long-term let", description: "A rental of a year or more." },
  { value: "short_term", label: "Short-term let", description: "A few weeks or months." },
  { value: "family", label: "Family member", description: "Someone in your family living there." },
  { value: "holiday_let", label: "Holiday let", description: "Guests staying for a holiday." },
  { value: "other", label: "Other", description: "Anything else. Add a note below." },
] as const;

export const TENANCY_LABELS: Record<string, string> = Object.fromEntries(TENANCY_TYPES.map((t) => [t.value, t.label]));

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A real calendar date typed as YYYY-MM-DD, or null. */
export function parseDateInput(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
