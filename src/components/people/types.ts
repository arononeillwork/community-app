/* Shapes returned by the members-by-block database functions, plus small pure helpers
   used by the member pages (server) and the block list (client). */

export type Relation = "owner" | "tenant";
export type ContactMethod = "phone" | "whatsapp" | "email" | "letter";

/** One row of block_directory(c): a person in a flat. Contact fields are null unless `shared`. */
export type DirRow = {
  building_id: string;
  building_name: string;
  building_sort: number;
  unit_id: string;
  unit_label: string;
  floor: number | null;
  profile_id: string;
  full_name: string;
  relation: Relation;
  tenancy_type: string | null;
  roles: string[] | null;
  email: string | null;
  phone: string | null;
  preferred_method: ContactMethod | null;
  best_times: string | null;
  shared: boolean;
  is_me: boolean;
};

/** One row of block_summary(c). */
export type BlockInfo = {
  building_id: string;
  building_name: string;
  building_sort: number;
  units: number;
  people: number;
  is_mine: boolean;
};

export type UnitLite = { id: string; label: string; floor: number | null; bedrooms: number | null; building_id: string | null };

/** A committee role held by a member (from key_contacts). building_id is set for block representatives. */
export type HeldTitle = { profile_id: string; role_title: string; building_id: string | null };

export const TENANCY_LABELS: Record<string, string> = {
  long_term: "Long-term", short_term: "Short-term", family: "Family member", holiday_let: "Holiday let", other: "Other",
};

export function relationLabel(p: Pick<DirRow, "relation" | "tenancy_type">) {
  if (p.relation === "owner") return "Owner";
  return p.tenancy_type ? `Tenant · ${TENANCY_LABELS[p.tenancy_type] ?? "Other"}` : "Tenant";
}

export const METHOD_LABELS: Record<ContactMethod, string> = {
  phone: "Prefers a call", whatsapp: "Prefers WhatsApp", email: "Prefers email", letter: "Prefers a letter",
};

export const METHOD_SHORT: Record<ContactMethod, string> = {
  phone: "Phone", whatsapp: "WhatsApp", email: "Email", letter: "Letter",
};

/** WhatsApp is only offered when the person says it is how they like to be reached. */
export function whatsappFor(p: Pick<DirRow, "preferred_method" | "phone">) {
  return p.preferred_method === "whatsapp" ? p.phone : null;
}

/** Badges for a person shown in a given block: committee roles (block representatives only in
    their own block), treasurer and admin. */
export function badgesFor(titles: HeldTitle[], roles: string[] | null | undefined, blockId: string | null) {
  const out: string[] = [];
  for (const t of titles) {
    if (t.building_id && t.building_id !== blockId) continue;
    out.push(t.building_id ? "Block representative" : t.role_title);
  }
  if (roles?.includes("treasurer")) out.push("Treasurer");
  if (roles?.includes("admin")) out.push("Admin");
  const seen = new Set<string>();
  return out.filter((b) => {
    const k = b.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function floorName(floor: number | null) {
  if (floor == null) return "Other flats";
  if (floor === 0) return "Ground floor";
  if (floor < 0) return `Basement ${Math.abs(floor)}`;
  return `Floor ${floor}`;
}

/** Door letter of a flat label such as "B-3C" → "C". Null when the label has no door part. */
export function doorOf(label: string) {
  const m = /\d+\s*([A-Za-z])$/.exec(label.trim());
  return m ? m[1].toUpperCase() : null;
}

/** Lower-case, accent-free text for searching ("Lucía" matches "lucia"). */
export function fold(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Flat labels compared without punctuation, so "3b", "B3B" and "b-3b" all find B-3B. */
export function flatKey(s: string | null | undefined) {
  return fold(s).replace(/[^a-z0-9]/g, "");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
