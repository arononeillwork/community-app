import {
  Building2, Bus, Car, Coffee, File, FileImage, FileSpreadsheet, FileText, Footprints, Info, Landmark, Pill, Route,
  ScrollText, ShoppingBag, Siren, Stethoscope, TreePalm, Truck, UtensilsCrossed, Waves, type LucideIcon,
} from "lucide-react";

/* Labels, icons and small pure helpers shared by Bins & info, Local area and Documents. */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- visibility
export type Visibility = "all" | "owners" | "admins";
export const VISIBILITIES: Visibility[] = ["all", "owners", "admins"];
export const VISIBILITY_LABELS: Record<Visibility, string> = { all: "Everyone", owners: "Owners only", admins: "Admins only" };
export const VISIBILITY_HINTS: Record<Visibility, string> = {
  all: "All residents, owners and tenants",
  owners: "Owners, the office and the treasurer",
  admins: "The office and the treasurer",
};

// ---------------------------------------------------------------- building information
export const INFO_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  siren: { icon: Siren, label: "Emergency" },
  "scroll-text": { icon: ScrollText, label: "Rules" },
  waves: { icon: Waves, label: "Pool" },
  car: { icon: Car, label: "Parking" },
  building: { icon: Building2, label: "Building" },
  truck: { icon: Truck, label: "Moving" },
  info: { icon: Info, label: "Information" },
};
export const INFO_ICON_KEYS = Object.keys(INFO_ICONS);
export const infoIcon = (key: string | null | undefined) => INFO_ICONS[key ?? ""]?.icon ?? Info;

export const INFO_CATEGORIES: { key: string; label: string }[] = [
  { key: "emergency", label: "Emergency" },
  { key: "rules", label: "Rules" },
  { key: "facilities", label: "Facilities" },
  { key: "parking", label: "Parking" },
  { key: "general", label: "General" },
];
export const INFO_CATEGORY_KEYS = INFO_CATEGORIES.map((c) => c.key);

// ---------------------------------------------------------------- bins
/** Weekdays in display order (Monday first). Values follow bin_schedules.weekdays: 0 = Sunday … 6 = Saturday. */
export const WEEK: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export function listWords(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Every day", "Every day except Sunday", "Monday, Wednesday and Friday". */
export function weekdaysInWords(days: number[]) {
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  if (set.size === 6) return `Every day except ${WEEK.find((d) => !set.has(d.value))!.long}`;
  if (set.size === 0) return "No collection days set";
  return listWords(WEEK.filter((d) => set.has(d.value)).map((d) => d.long));
}

/** Weekday number (0 = Sunday) of "now" in the community's time zone, and of tomorrow. */
export function todayAndTomorrow(timeZone: string) {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date());
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
  return { today, tomorrow: (today + 1) % 7 };
}

// ---------------------------------------------------------------- local places
export const PLACE_TYPES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "walk", label: "Walks", icon: Footprints },
  { key: "route", label: "Routes", icon: Route },
  { key: "beach", label: "Beaches", icon: TreePalm },
  { key: "restaurant", label: "Restaurants", icon: UtensilsCrossed },
  { key: "cafe", label: "Cafés", icon: Coffee },
  { key: "shop", label: "Shops", icon: ShoppingBag },
  { key: "pharmacy", label: "Pharmacies", icon: Pill },
  { key: "health", label: "Health", icon: Stethoscope },
  { key: "transport", label: "Transport", icon: Bus },
  { key: "sight", label: "Sights", icon: Landmark },
];
export const PLACE_TYPE_KEYS = PLACE_TYPES.map((t) => t.key);
export const PLACE_TYPE_SINGULAR: Record<string, string> = {
  walk: "Walk", route: "Route", beach: "Beach", restaurant: "Restaurant", cafe: "Café", shop: "Shop",
  pharmacy: "Pharmacy", health: "Health", transport: "Transport", sight: "Sight",
};
export const placeType = (key: string) => PLACE_TYPES.find((t) => t.key === key) ?? { key, label: key, icon: Landmark };

/** 0.4 → "400 m", 1.2 → "1.2 km", 12 → "12 km". */
export function formatDistance(km: number | string | null | undefined) {
  if (km == null || km === "") return null;
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `${Math.max(50, Math.round((n * 1000) / 50) * 50)} m`;
  return `${n % 1 === 0 || n >= 10 ? Math.round(n) : n.toFixed(1)} km`;
}

export const PRICE_WORDS = ["", "Inexpensive", "Moderate", "Expensive", "Very expensive"];

/** Only http(s) links are shown as websites. */
export function safeHttpUrl(v: string | null | undefined) {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Google Maps directions to a place: its coordinates when known, otherwise its address in the community's town. */
export function directionsUrl(p: { name: string; address: string | null; lat: number | null; lng: number | null; place_type: string; distance_km: number | string | null },
  communityAddress: string | null | undefined) {
  const sp = new URLSearchParams({ api: "1" });
  if (p.lat != null && p.lng != null) {
    sp.set("destination", `${p.lat},${p.lng}`);
  } else {
    // "Avenida del Mar 12, 29670 San Pedro de Alcántara, Málaga" → the town part, so "Plaza de la Iglesia" is found locally.
    const town = (communityAddress ?? "").split(",").slice(1).join(",").trim() || communityAddress || "";
    sp.set("destination", [p.address ?? p.name, town].filter(Boolean).join(", "));
  }
  const km = Number(p.distance_km);
  if (Number.isFinite(km) && km > 0 && km <= 2) sp.set("travelmode", "walking");
  return `https://www.google.com/maps/dir/?${sp.toString()}`;
}

// ---------------------------------------------------------------- documents
export const FOLDER_ORDER = ["Rules", "Meetings", "Finance", "Contracts", "General"];
export function sortFolders(folders: string[]) {
  return [...new Set(folders)].sort((a, b) => {
    const ia = FOLDER_ORDER.indexOf(a), ib = FOLDER_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/** Allowed uploads: extension → content type and a short word residents recognise. */
export const FILE_TYPES: Record<string, { mime: string; kind: string }> = {
  pdf: { mime: "application/pdf", kind: "PDF" },
  jpg: { mime: "image/jpeg", kind: "Photo" },
  jpeg: { mime: "image/jpeg", kind: "Photo" },
  png: { mime: "image/png", kind: "Image" },
  webp: { mime: "image/webp", kind: "Image" },
  heic: { mime: "image/heic", kind: "Photo" },
  doc: { mime: "application/msword", kind: "Word" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "Word" },
  xls: { mime: "application/vnd.ms-excel", kind: "Excel" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "Excel" },
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",");
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function fileExtension(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Icon and word for a stored document. */
export function fileKind(mime: string | null | undefined, path: string | null | undefined): { icon: LucideIcon; label: string } {
  if (!path) return { icon: FileText, label: "Text" };
  const m = mime ?? "";
  if (m === "application/pdf") return { icon: FileText, label: "PDF" };
  if (m.startsWith("image/")) return { icon: FileImage, label: "Image" };
  if (m.includes("spreadsheet") || m.includes("ms-excel")) return { icon: FileSpreadsheet, label: "Excel" };
  if (m.includes("word")) return { icon: FileText, label: "Word" };
  return { icon: File, label: "File" };
}

export function formatBytes(n: number | string | null | undefined) {
  if (n == null) return null;
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return null;
  if (b < 1024) return `${b} bytes`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** "a.pdf" style names that are safe in a storage path. */
export function safeFileName(name: string) {
  const ext = fileExtension(name);
  const stem = name.replace(/\.[^.]+$/, "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  return ext ? `${stem}.${ext}` : stem;
}

/** A language's name in English, for sentences: "es" → "Spanish". */
export function languageLabel(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** A language's name in that language, for language pickers: "es" → "Español". */
export function languageName(code: string) {
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
