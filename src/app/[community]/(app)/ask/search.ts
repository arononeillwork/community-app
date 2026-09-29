import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, binDaysWords, capitalise, placeTypeLabel, type Bin } from "@/components/info/labels";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Hit = { id: string; title: string; text: string; href: string | null; score: number; swatch?: string };
export type GroupKey = "bins" | "info" | "faq" | "places" | "documents";
export type SearchResult = {
  terms: string[];
  binIntent: boolean;
  groups: Record<GroupKey, Hit[]>;
  /** Bins collected tomorrow (only filled when the question is about bins). */
  tomorrowBins: { title: string; swatch: string; putOut: string | null }[];
  total: number;
};

const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "am", "do", "does", "did", "can", "could", "will", "would", "should",
  "i", "me", "my", "we", "us", "our", "you", "your", "it", "its", "there", "this", "that", "these", "those",
  "what", "which", "when", "where", "who", "whom", "why", "how", "whats", "wheres",
  "to", "of", "in", "on", "at", "for", "from", "by", "with", "about", "and", "or", "not", "no", "yes", "if", "so",
  "please", "tell", "know", "want", "need", "get", "go", "put", "out", "any", "some", "near", "nearest", "closest",
  "today", "tomorrow", "tonight", "day", "days", "time", "times",
  // a few common Spanish words
  "el", "la", "los", "las", "de", "del", "que", "y", "en", "un", "una", "es", "por", "para", "con",
]);

const BIN_WORDS = new Set([
  "bin", "bins", "rubbish", "trash", "garbage", "waste", "recycling", "recycle", "basura", "glass", "paper",
  "plastic", "cardboard", "cartons", "cans", "organic", "compost", "collection", "collected", "reciclaje",
]);

/** Very small stemmer so "opening hours" finds "Open … 10:00". */
function stem(w: string) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Split a question into search words. Punctuation, wildcards and PostgREST filter characters are removed. */
export function parseQuery(q: string) {
  const words = q.toLowerCase().split(/[\s,.;:!?¿¡"'“”‘’()[\]{}<>/\\|@#$%^&*+=~`_–—-]+/).filter(Boolean);
  const binIntent = words.some((w) => BIN_WORDS.has(w));
  const terms = Array.from(new Set(words.filter((w) => w.length >= 2 && !STOP.has(w)).map(stem).filter((w) => w.length >= 2)))
    .slice(0, 6);
  return { terms, binIntent };
}

function score(terms: string[], title: string, text: string) {
  const t = title.toLowerCase();
  const all = `${t} ${text.toLowerCase()}`;
  let n = 0;
  for (const term of terms) {
    if (all.includes(term)) n += 1;
    if (t.includes(term)) n += 1;
  }
  return n;
}

/** Up to ~220 characters of `text` around the first matching word. */
export function snippet(text: string, terms: string[], size = 220) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= size) return flat;
  const lower = flat.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 60);
  const end = Math.min(flat.length, start + size);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

const byScore = (a: Hit, b: Hit) => b.score - a.score || a.title.localeCompare(b.title);

export async function searchCommunity(supabase: Supabase, communityId: string, base: string, q: string, tomorrow: number): Promise<SearchResult> {
  const { terms, binIntent } = parseQuery(q);
  const groups: SearchResult["groups"] = { bins: [], info: [], faq: [], places: [], documents: [] };
  const tomorrowBins: SearchResult["tomorrowBins"] = [];
  if (!terms.length && !binIntent) return { terms, binIntent, groups, tomorrowBins, total: 0 };

  const or = (cols: string[]) => terms.flatMap((t) => cols.map((c) => `${c}.ilike.%${t}%`)).join(",");
  const none = Promise.resolve({ data: [] as Record<string, unknown>[] });

  const binQuery = supabase.from("bin_schedules")
    .select("id, bin_type, color, color_hex, weekdays, put_out_time, location, notes")
    .eq("community_id", communityId).order("sort");

  // Every query runs as the signed-in person, so RLS limits info pages and documents to what they may see.
  const [info, bins, faq, places, docs] = await Promise.all([
    terms.length ? supabase.from("info_pages").select("id, title, body").eq("community_id", communityId).or(or(["title", "body"])).limit(20) : none,
    binIntent ? binQuery : terms.length ? binQuery.or(or(["bin_type", "color", "notes"])) : none,
    terms.length ? supabase.from("faq_entries").select("id, question, answer").eq("community_id", communityId).or(or(["question", "answer"])).limit(20) : none,
    terms.length ? supabase.from("local_places").select("id, name, description, place_type, distance_km").eq("community_id", communityId).or(or(["name", "description", "place_type"])).limit(20) : none,
    terms.length ? supabase.from("documents").select("id, title, description, folder").eq("community_id", communityId).or(or(["title", "description"])).limit(20) : none,
  ]);

  for (const r of (info.data ?? []) as { id: string; title: string; body: string }[]) {
    groups.info.push({ id: r.id, title: r.title, text: snippet(r.body ?? "", terms), href: `${base}/info#info-${r.id}`, score: score(terms, r.title, r.body ?? "") });
  }
  for (const b of (bins.data ?? []) as Bin[]) {
    const days = binDaysWords({ weekdays: Array.isArray(b.weekdays) ? b.weekdays : [] });
    const collectedTomorrow = Array.isArray(b.weekdays) && b.weekdays.includes(tomorrow);
    const text = [
      `Collected: ${days}.`,
      collectedTomorrow ? `Yes, collected tomorrow (${DAY_NAMES[tomorrow]}).` : `Not collected tomorrow (${DAY_NAMES[tomorrow]}).`,
      b.put_out_time ? `Put out: ${b.put_out_time}.` : "",
      b.location ? `Where: ${b.location}.` : "",
      b.notes ?? "",
    ].filter(Boolean).join(" ");
    const title = `${b.bin_type} (${capitalise(b.color)} bin)`;
    if (binIntent && collectedTomorrow) tomorrowBins.push({ title, swatch: b.color_hex, putOut: b.put_out_time });
    groups.bins.push({ id: b.id, title, text, href: `${base}/info#bins`, score: binIntent ? 1 + score(terms, title, text) : score(terms, title, text), swatch: b.color_hex });
  }
  for (const f of (faq.data ?? []) as { id: string; question: string; answer: string }[]) {
    groups.faq.push({ id: f.id, title: f.question, text: snippet(f.answer ?? "", terms, 500), href: null, score: score(terms, f.question, f.answer ?? "") });
  }
  for (const p of (places.data ?? []) as { id: string; name: string; description: string | null; place_type: string; distance_km: number | string | null }[]) {
    const km = p.distance_km == null ? "" : ` · ${Number(p.distance_km).toLocaleString("en-GB")} km away`;
    const text = `${placeTypeLabel(p.place_type)}${km}. ${p.description ?? ""}`.trim();
    groups.places.push({
      id: p.id, title: p.name, text: snippet(text, terms),
      href: `${base}/local?type=${encodeURIComponent(p.place_type)}#place-${p.id}`,
      score: score(terms, p.name, `${p.place_type} ${p.description ?? ""}`),
    });
  }
  for (const d of (docs.data ?? []) as { id: string; title: string; description: string | null; folder: string }[]) {
    const text = [d.folder ? `Folder: ${d.folder}.` : "", d.description ?? ""].filter(Boolean).join(" ");
    groups.documents.push({ id: d.id, title: d.title, text: snippet(text, terms), href: `${base}/documents/${d.id}`, score: score(terms, d.title, d.description ?? "") });
  }

  // Bins keep their normal order (as on the info page); everything else is best match first.
  if (!binIntent) groups.bins.sort(byScore);
  groups.info.sort(byScore);
  groups.faq.sort(byScore);
  groups.places.sort(byScore);
  groups.documents.sort(byScore);

  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  return { terms, binIntent, groups, tomorrowBins, total };
}
