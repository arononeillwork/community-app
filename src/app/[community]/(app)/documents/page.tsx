import Link from "next/link";
import { ChevronRight, FileText, FolderOpen, Search, SearchX, Upload } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice, PageHeader, TabLinks } from "@/components/ui";
import { VISIBILITY_LABELS, fileKind, formatBytes, languageLabel, sortFolders, type Visibility } from "@/components/library/meta";

export const metadata = { title: "Documents" };

type Doc = {
  id: string; title: string; folder: string; description: string | null; storage_path: string | null; mime_type: string | null;
  size_bytes: number | null; visibility: Visibility; original_language: string; created_at: string;
};

/** Words for a PostgREST ilike filter: no wildcards, quotes or separators from the user. */
function cleanQuery(q: string) {
  return q.replace(/[%_\\,()"'*:;.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The text as one line for search snippets: headings end with a colon, list markers are dropped, lines end with a stop. */
function flatten(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    if (/^#+\s+/.test(l)) return `${l.replace(/^#+\s+/, "").replace(/:$/, "")}:`;
    const t = l.replace(/^[•\-–*]\s+/, "");
    return /[.:;!?…)]$/.test(t) ? t : `${t}.`;
  }).join(" ").replace(/\s+/g, " ");
}

/** A short piece of text around the first match, with the match marked. */
function snippet(text: string | null | undefined, term: string) {
  if (!text || !term) return null;
  const flat = flatten(text);
  const i = flat.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, flat.lastIndexOf(" ", Math.max(0, i - 50)) + 1);
  const endSpace = flat.indexOf(" ", i + term.length + 60);
  const end = endSpace < 0 ? flat.length : endSpace;
  return {
    before: (start > 0 ? "…" : "") + flat.slice(start, i),
    match: flat.slice(i, i + term.length),
    after: flat.slice(i + term.length, end) + (end < flat.length ? "…" : ""),
  };
}

export default async function DocumentsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ q?: string; folder?: string; deleted?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;
  const term = cleanQuery(sp.q ?? "");

  // RLS returns only the documents this person may see (everyone / owners / admins).
  const { data } = await supabase.from("documents")
    .select("id, title, folder, description, storage_path, mime_type, size_bytes, visibility, original_language, created_at")
    .eq("community_id", c).order("created_at", { ascending: false }).order("title");
  const all = (data ?? []) as Doc[];

  // Search titles, descriptions, folders, the text and any finished translations.
  const snippets = new Map<string, ReturnType<typeof snippet> & { lang?: string }>();
  let matched: Set<string> | null = null;
  if (term) {
    const pat = `"%${term}%"`;
    const [{ data: hits }, { data: tHits }] = await Promise.all([
      supabase.from("documents").select("id, title, description, folder, extracted_text").eq("community_id", c)
        .or(`title.ilike.${pat},description.ilike.${pat},folder.ilike.${pat},extracted_text.ilike.${pat}`),
      supabase.from("document_translations").select("document_id, language, translated_text").eq("community_id", c)
        .eq("status", "done").ilike("translated_text", `%${term}%`),
    ]);
    matched = new Set<string>();
    for (const h of hits ?? []) {
      matched.add(h.id);
      const inMeta = [h.title, h.description, h.folder].some((x) => x?.toLowerCase().includes(term.toLowerCase()));
      const sn = inMeta ? null : snippet(h.extracted_text, term);
      if (sn) snippets.set(h.id, sn);
    }
    for (const t of tHits ?? []) {
      if (!matched.has(t.document_id)) {
        matched.add(t.document_id);
        const sn = snippet(t.translated_text, term);
        if (sn) snippets.set(t.document_id, { ...sn, lang: t.language });
      }
    }
  }

  const found = matched ? all.filter((d) => matched!.has(d.id)) : all;
  const folders = sortFolders(all.map((d) => d.folder));
  const folder = folders.includes(sp.folder ?? "") ? sp.folder! : "";
  const shown = folder ? found.filter((d) => d.folder === folder) : found;
  const groups = sortFolders(shown.map((d) => d.folder)).map((f) => ({ folder: f, docs: shown.filter((d) => d.folder === f) }));

  const link = (f: string) => {
    const q = new URLSearchParams();
    if (term) q.set("q", term);
    if (f) q.set("folder", f);
    return `${base}/documents${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Documents" intro="Rules, minutes, budgets and other papers of the community."
        actions={s.isAdmin ? <Button href={`${base}/documents/new`}><Upload aria-hidden className="size-4" /> Upload document</Button> : undefined} />

      {sp.deleted && <div className="mb-5"><Notice tone="ok">Document deleted.</Notice></div>}

      {all.length === 0 ? (
        <Empty title="No documents yet" icon={FileText}
          action={s.isAdmin ? <Button href={`${base}/documents/new`}>Upload a document</Button> : undefined}>
          {s.isAdmin ? "Upload the statutes, house rules and meeting minutes so residents can find them." : "The office will add the statutes, house rules and minutes here."}
        </Empty>
      ) : (
        <>
          <form role="search" action={`${base}/documents`} className="mb-4 flex items-end gap-2 sm:max-w-xl">
            <div className="field min-w-0 flex-1">
              <label htmlFor="q" className="!text-sm !text-muted">Search documents</label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted" />
                <input id="q" name="q" type="search" defaultValue={term} className="input pl-10" placeholder="e.g. pool, insurance" />
              </div>
            </div>
            {folder && <input type="hidden" name="folder" value={folder} />}
            <Button type="submit" variant="secondary">Search</Button>
          </form>

          <TabLinks label="Folders" tabs={[
            { href: link(""), label: "All", active: !folder, count: found.length },
            // While searching, only folders with matches (and the chosen one) are offered.
            ...folders.map((f) => ({ href: link(f), label: f, active: folder === f, count: found.filter((d) => d.folder === f).length }))
              .filter((t) => !term || t.count > 0 || t.active),
          ]} />

          {term && (
            <p className="-mt-2 mb-4 text-[0.9375rem] text-muted" aria-live="polite">
              {shown.length === 0 ? "No documents" : shown.length === 1 ? "1 document" : `${shown.length} documents`} match “{term}”.{" "}
              <Link href={folder ? `${base}/documents?folder=${encodeURIComponent(folder)}` : `${base}/documents`} className="font-medium">Clear search</Link>
            </p>
          )}

          {shown.length === 0 ? (
            <Empty title={term ? `Nothing matches “${term}”` : "This folder is empty"} icon={term ? SearchX : FolderOpen}
              action={<Button href={`${base}/documents`} variant="secondary">See all documents</Button>}>
              {term ? "Try another word, or ask the office." : "Choose another folder."}
            </Empty>
          ) : (
            <Card padded={false} className="overflow-hidden">
              {groups.map((g, gi) => (
                <section key={g.folder} aria-labelledby={`folder-${gi}`} className={gi > 0 ? "border-t border-line" : undefined}>
                  <h2 id={`folder-${gi}`} className="flex items-center gap-2 px-5 pb-1.5 pt-4 text-sm font-medium text-muted sm:px-6">
                    <FolderOpen aria-hidden className="size-4" /> {g.folder}
                    <span className="tabular font-normal">· {g.docs.length}</span>
                  </h2>
                  <ul className="divide-y divide-line">
                    {g.docs.map((d) => {
                      const kind = fileKind(d.mime_type, d.storage_path);
                      const size = formatBytes(d.size_bytes);
                      const lang = d.original_language !== s.community.default_language ? languageLabel(d.original_language) : null;
                      const fileWords = [d.storage_path ? kind.label : "Read online", size, lang].filter(Boolean).join(" · ");
                      const sn = snippets.get(d.id);
                      return (
                        <li key={d.id}>
                          <Link href={`${base}/documents/${d.id}${sn?.lang ? `?lang=${sn.lang}#text` : ""}`} className="group flex items-center gap-4 px-5 py-3.5 text-ink no-underline transition-colors hover:bg-surface-2 sm:px-6">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-inset ring-line">
                              <kind.icon aria-hidden className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-medium leading-snug group-hover:underline">{d.title}</span>
                                {d.visibility !== "all" && <Badge tone={d.visibility === "admins" ? "warn" : "neutral"} dot={false}>{VISIBILITY_LABELS[d.visibility]}</Badge>}
                              </span>
                              {d.description && <span className="block truncate text-[0.9375rem] text-muted">{d.description}</span>}
                              {sn && (
                                <span className="mt-0.5 block text-sm text-ink-2">
                                  {sn.lang && <span className="text-muted">{languageLabel(sn.lang)}: </span>}
                                  {sn.before}<mark className="rounded-sm bg-warn-soft text-ink">{sn.match}</mark>{sn.after}
                                </span>
                              )}
                              <span className="block text-sm text-muted sm:hidden">{date(d.created_at, s.community.timezone)} · {fileWords}</span>
                            </span>
                            <span className="hidden shrink-0 text-right text-sm text-muted sm:block">
                              <span className="block">{date(d.created_at, s.community.timezone)}</span>
                              <span className="block">{fileWords}</span>
                            </span>
                            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
