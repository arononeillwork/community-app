import { todayInput } from "@/lib/format";

/** Document / info visibility in plain words (DB enum: all | owners | admins). */
export const VISIBILITY_WORDS: Record<string, string> = {
  all: "Everyone",
  owners: "Owners only",
  admins: "Committee only",
};

export const VISIBILITY_HINTS: Record<string, string> = {
  all: "All residents can see it: owners and tenants.",
  owners: "Only flat owners and the committee can see it.",
  admins: "Only the committee (administrator and treasurer) can see it.",
};

export function visibilityWord(v: string | null | undefined) {
  return VISIBILITY_WORDS[v ?? ""] ?? "Everyone";
}

/** "es" -> "Spanish". Falls back to the code if the runtime has no name for it. */
export function languageName(code: string | null | undefined) {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Place types in the order the chips are shown, with plain names. */
export const PLACE_TYPES: { value: string; label: string; one: string }[] = [
  { value: "restaurant", label: "Restaurants", one: "Restaurant" },
  { value: "cafe", label: "Cafés", one: "Café" },
  { value: "walk", label: "Walks", one: "Walk" },
  { value: "route", label: "Routes", one: "Route" },
  { value: "beach", label: "Beaches", one: "Beach" },
  { value: "shop", label: "Shops", one: "Shop" },
  { value: "pharmacy", label: "Pharmacies", one: "Pharmacy" },
  { value: "health", label: "Health", one: "Health" },
  { value: "sight", label: "Sights", one: "Sight" },
  { value: "transport", label: "Transport", one: "Transport" },
];

export function placeTypeLabel(t: string | null | undefined, plural = false) {
  const hit = PLACE_TYPES.find((p) => p.value === t);
  if (hit) return plural ? hit.label : hit.one;
  if (!t) return "Other";
  return t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function priceWords(level: number | null | undefined) {
  switch (level) {
    case 1: return "Low prices";
    case 2: return "Medium prices";
    case 3: return "High prices";
    case 4: return "Very expensive";
    default: return null;
  }
}

/** "+34 600 100 200" -> "tel:+34600100200" */
export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Accepts "www.example.com" or "https://example.com"; returns a safe http(s) URL or null. */
export function safeUrl(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Full weekday names indexed like the DB (0 = Sunday … 6 = Saturday). */
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Display order for a week grid: Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Weekday (0 = Sunday) in the community's time zone, `addDays` from today. */
export function weekdayIn(timeZone: string, addDays = 0) {
  const [y, m, d] = todayInput(timeZone).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays)).getUTCDay();
}

/** ["Monday", "Wednesday", "Friday"] -> "Monday, Wednesday and Friday" */
export function listWords(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export type Bin = {
  id: string;
  bin_type: string;
  color: string;
  color_hex: string;
  weekdays: number[];
  put_out_time: string | null;
  location: string | null;
  notes: string | null;
};

export function isEveryDay(b: Pick<Bin, "weekdays">) {
  return new Set(b.weekdays ?? []).size >= 7;
}

export function binDaysWords(b: Pick<Bin, "weekdays">) {
  if (isEveryDay(b)) return "Every day";
  const days = WEEK_ORDER.filter((d) => (b.weekdays ?? []).includes(d)).map((d) => DAY_NAMES[d]);
  return days.length ? listWords(days) : "No collection days set";
}

export function capitalise(s: string | null | undefined) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1234567 -> "1.2 MB" */
export function fileSize(bytes: number | string | null | undefined) {
  const n = Number(bytes);
  if (!bytes || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain name for a file type: "PDF", "Word document", "Photo" … */
export function fileKind(mime: string | null | undefined, path?: string | null) {
  const m = (mime ?? "").toLowerCase();
  const ext = (path ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "PDF";
  if (m.includes("word") || ["doc", "docx", "odt"].includes(ext)) return "Word document";
  if (m.includes("sheet") || m.includes("excel") || ["xls", "xlsx", "ods", "csv"].includes(ext)) return "Spreadsheet";
  if (m.includes("presentation") || ["ppt", "pptx", "odp"].includes(ext)) return "Presentation";
  if (m.startsWith("image/")) return "Picture";
  if (m.startsWith("text/") || ext === "txt") return "Text file";
  return "File";
}

/** Safe ASCII file name for storage paths and downloads. */
export function safeFileName(name: string, fallback = "document") {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "");
  return (cleaned || fallback).slice(-120);
}
