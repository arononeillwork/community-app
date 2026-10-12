/* Small display helpers for the administration pages. */

/** "today", "yesterday", "3 days ago", "5 weeks ago", "2 months ago". */
export function ago(d: string | Date | null | undefined, now = new Date()) {
  if (!d) return "";
  const then = typeof d === "string" ? new Date(d) : d;
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  treasurer: "Treasurer",
  owner: "Owner",
  tenant: "Tenant",
};

export const ROLE_ORDER = ["admin", "treasurer", "owner", "tenant"] as const;

export const TENANCY_TYPES: { value: string; label: string }[] = [
  { value: "long_term", label: "Long-term let" },
  { value: "short_term", label: "Short-term let" },
  { value: "holiday_let", label: "Holiday let" },
  { value: "family", label: "Family member" },
  { value: "other", label: "Other" },
];

export const VISIBILITY_LABELS: Record<string, string> = {
  all: "Everyone in the community",
  block: "Neighbours in their block",
  unit: "Only the people of their own flat",
  admins: "Administrators only",
};

export const METHOD_LABELS: Record<string, string> = {
  phone: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
  letter: "Letter",
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "fr", label: "Français" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "no", label: "Norsk" },
];

export function languageName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

/** Sort flat labels like A-2B naturally (block, floor, door). */
export function byLabel(a: string, b: string) {
  return a.localeCompare(b, "en", { numeric: true });
}

/** Format a participation coefficient as "2.53 %". */
export function pct(n: number | string | null | undefined, digits = 2) {
  if (n == null || n === "") return "–";
  return `${Number(n).toFixed(digits)} %`;
}

/** Today's date (YYYY-MM-DD) in a time zone, shifted by a number of days. */
export function dayInput(timeZone: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
}

/** A timestamp as "12 Oct 2026" in the community's time zone. */
export function dayIn(d: string | Date | null | undefined, timeZone: string) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(d));
}
