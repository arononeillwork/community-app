/** Helpers for showing people and their contact details. Safe to use on server and client. */

export type ContactMethod = "phone" | "whatsapp" | "email" | "letter";

export const METHOD_LABELS: Record<string, string> = {
  phone: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
  letter: "Letter",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  treasurer: "Treasurer",
  owner: "Owner",
  tenant: "Tenant",
};

/** Plain-language explanation of each role (shown next to the role word). */
export const ROLE_EXPLAINED: Record<string, string> = {
  admin: "Runs the community day to day",
  treasurer: "Looks after the community's money",
  owner: "Owns a flat here",
  tenant: "Rents a flat here",
};

const ROLE_ORDER = ["admin", "treasurer", "owner", "tenant"];

/** The most important role a person has (admin > treasurer > owner > tenant). */
export function mainRole(roles: readonly string[] | null | undefined): string {
  const list = roles ?? [];
  return ROLE_ORDER.find((r) => list.includes(r)) ?? list[0] ?? "";
}

/** Roles in a stable, sensible order. */
export function sortRoles(roles: readonly string[] | null | undefined): string[] {
  return [...(roles ?? [])].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a);
    const ib = ROLE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Trimmed string, or null when empty. */
export function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

/** tel: link. Keeps a leading + and digits only. */
export function telHref(phone: string) {
  const p = phone.trim();
  return `tel:${p.startsWith("+") ? "+" : ""}${p.replace(/\D/g, "")}`;
}

/** WhatsApp link (https://wa.me/<digits only>), or null when the number is too short to be a mobile. */
export function waHref(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // 0034… → 34…
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function mailHref(email: string) {
  return `mailto:${email.trim()}`;
}

export function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
