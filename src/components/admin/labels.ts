/** Plain-language labels used across the administration pages. Safe for server and client. */

export const ROLES = ["owner", "tenant", "admin", "treasurer"] as const;
export type AdminRole = (typeof ROLES)[number];

export function isRole(v: unknown): v is AdminRole {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  tenant: "Tenant",
  admin: "Administrator",
  treasurer: "Treasurer",
};

export const ROLE_PLURALS: Record<AdminRole, string> = {
  owner: "Owners",
  tenant: "Tenants",
  admin: "Administrators",
  treasurer: "Treasurers",
};

export const ROLE_HINTS: Record<AdminRole, string> = {
  owner: "Owns a flat. Can see the flat's fees and add their own tenants.",
  tenant: "Rents or lives in a flat that someone else owns.",
  admin: "Runs the community in the app: people, reports and settings.",
  treasurer: "Looks after the money: invoices, budgets and owner fees.",
};

/** Roles that must be linked to a flat. */
export function needsFlat(role: string) {
  return role === "owner" || role === "tenant";
}

export const TENANCY_TYPES = ["long_term", "short_term", "family", "holiday_let", "other"] as const;
export type TenancyType = (typeof TENANCY_TYPES)[number];

export const TENANCY_TYPE_LABELS: Record<TenancyType, string> = {
  long_term: "Long-term rental",
  short_term: "Short-term rental",
  family: "Family member",
  holiday_let: "Holiday let",
  other: "Other",
};

export function tenancyTypeLabel(v: string | null | undefined) {
  return (v && TENANCY_TYPE_LABELS[v as TenancyType]) || "Other";
}

/** complaint_target enum → words residents use. */
export const TARGET_LABELS: Record<string, string> = {
  unit: "Flat",
  owner: "Owner",
  supplier: "Supplier",
  common_area: "Common area",
};

export const OPEN_REPORT_STATUSES = ["new", "acknowledged", "in_progress"] as const;

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish (Español)" },
  { code: "de", name: "German (Deutsch)" },
  { code: "nl", name: "Dutch (Nederlands)" },
  { code: "sv", name: "Swedish (Svenska)" },
  { code: "da", name: "Danish (Dansk)" },
  { code: "no", name: "Norwegian (Norsk)" },
  { code: "fr", name: "French (Français)" },
] as const;

export const LANGUAGE_CODES: string[] = LANGUAGES.map((l) => l.code);

export function languageName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-09-29" → "2026-09-28" (pure calendar arithmetic, no time zones involved). */
export function previousDay(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Confirmation shown after an action redirects back with ?done=<key>. */
export function doneMessage(key: string | undefined | null): string | null {
  if (!key) return null;
  const fixed: Record<string, string> = {
    approved: "Tenancy approved. The tenant can now use the app.",
    declined: "Tenancy declined. The tenant cannot use the app.",
    removed: "Removed from the community. Their reports and history are kept.",
    ownership_ended: "Done. The ownership has ended.",
    tenancy_ended: "Done. The tenancy has ended.",
  };
  if (Object.prototype.hasOwnProperty.call(fixed, key)) return fixed[key];
  const [what, role] = key.split("_");
  if (!isRole(role)) return null;
  const r = ROLE_LABELS[role].toLowerCase();
  if (what === "now") return `Done. The role has been changed to ${r}.`;
  if (what === "ended") return `Done. The ${r} role has ended.`;
  if (what === "restored") return `Done. The ${r} role has been given back.`;
  return null;
}
