import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenText, Download, ExternalLink, Languages, Pencil } from "lucide-react";
import { getCommunity, requireResident } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { Badge, Button, Card, DefinitionList, Empty, Notice, PageHeader, SectionHeader, TabLinks, buttonClass } from "@/components/ui";
import RichText from "@/components/library/RichText";
import { UUID_RE, VISIBILITY_LABELS, fileKind, formatBytes, languageLabel, languageName, listWords, type Visibility } from "@/components/library/meta";

export async function generateMetadata({ params }: { params: Promise<{ community: string; id: string }> }): Promise<Metadata> {
  const { community, id } = await params;
  const c = await getCommunity(community);
  if (!c || !UUID_RE.test(id)) return { title: "Document" };
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("title").eq("id", id).eq("community_id", c.id).maybeSingle();
  return { title: data?.title ?? "Document" };
}

const NOTICES: Record<string, string> = { new: "Document uploaded.", "1": "Changes saved." };

/** Extracted text often starts with the document's own title; the page already shows it as the heading. */
function withoutTitleLine(text: string | null, title: string) {
  if (!text) return text;
  const [first, ...rest] = text.trimStart().split("\n");
  const plain = (v: string) => v.toLowerCase().replace(/^#+\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return rest.join("\n").trim() && plain(first).includes(plain(title)) ? rest.join("\n").trim() : text;
}

export default async function DocumentPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ lang?: string; saved?: string; file?: string }>;
}) {
  const { community, id } = await params;
  const sp = await searchParams;
  const s = await requireResident(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  // RLS: a document someone may not see simply does not exist for them.
  const { data: d } = await supabase.from("documents")
    .select("id, title, folder, description, storage_path, mime_type, size_bytes, visibility, original_language, extracted_text, created_at, uploaded_by")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!d) notFound();

  const [{ data: tr }, uploader] = await Promise.all([
    supabase.from("document_translations").select("language, translated_text").eq("document_id", d.id).eq("status", "done"),
    s.isAdmin && d.uploaded_by
      ? supabase.from("profiles").select("full_name").eq("id", d.uploaded_by).maybeSingle().then((r) => r.data?.full_name ?? null)
      : Promise.resolve(null),
  ]);
  const translations = new Map((tr ?? []).filter((t) => t.translated_text).map((t) => [t.language as string, t.translated_text as string]));

  // Language switch: the original, then the finished translations. Other community languages are listed
  // underneath with a pointer to the office; asking for one of them directly (?lang=) explains the same.
  const original = d.original_language as string;
  const enabled = (s.community.enabled_languages ?? []).filter((l) => l !== original);
  const pref = s.prefs?.language;
  const lang = [original, ...enabled].includes(sp.lang ?? "") ? sp.lang!
    : pref && pref !== original && translations.has(pref) ? pref : original;
  const tabs = [original, ...enabled.filter((l) => translations.has(l) || l === lang)];
  const missing = enabled.filter((l) => !translations.has(l));
  const reading = withoutTitleLine(lang === original ? d.extracted_text : translations.get(lang) ?? null, d.title);

  const kind = fileKind(d.mime_type, d.storage_path);
  const size = formatBytes(d.size_bytes);
  const visibility = d.visibility as Visibility;
  const notice = NOTICES[sp.saved ?? ""];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={d.title} eyebrow={d.folder} back={{ href: `${base}/documents`, label: "Documents" }}
        actions={s.isAdmin ? <Button href={`${base}/documents/${d.id}/edit`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit</Button> : undefined} />
      <div className="flex flex-col gap-5">
        {notice && <Notice tone="ok">{notice}</Notice>}
        {sp.file === "missing" && d.storage_path && (
          <Notice tone="bad">The file could not be opened. Please try again in a moment, or ask the office.</Notice>
        )}

        <Card className="flex flex-col gap-5">
          {(d.description || d.storage_path) && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {d.description && <p className="text-ink-2">{d.description}</p>}
              {d.storage_path && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button href={`${base}/documents/${d.id}/file`} external aria-label={`Open ${d.title} (opens in a new tab)`}>
                    <ExternalLink aria-hidden className="size-4" /> Open
                  </Button>
                  <a href={`${base}/documents/${d.id}/file?download=1`} className={buttonClass("secondary")} aria-label={`Download ${d.title}`}>
                    <Download aria-hidden className="size-4" /> Download
                  </a>
                </div>
              )}
            </div>
          )}
          <DefinitionList items={[
            { label: "Added", value: <>{date(d.created_at, s.community.timezone)}{uploader ? <span className="text-muted"> · by {uploader}</span> : null}</> },
            // Only the rows that tell people something: no "File" row without a file, no "Everyone" for residents.
            ...(d.storage_path ? [{ label: "File", value: `${kind.label}${size ? ` · ${size}` : ""}` }] : []),
            { label: "Written in", value: languageLabel(original) },
            ...(visibility !== "all" || s.isAdmin ? [{
              label: "Who can see it",
              value: visibility === "all" ? VISIBILITY_LABELS.all
                : <Badge tone={visibility === "admins" ? "warn" : "neutral"} dot={false}>{VISIBILITY_LABELS[visibility]}</Badge>,
            }] : []),
          ]} />
        </Card>

        <Card padded={false} className="scroll-mt-24">
          <div id="text" className="p-5 pb-0 sm:p-6 sm:pb-0">
            <SectionHeader icon={BookOpenText} title="Read it here" description={tabs.length > 1 ? "Choose a language" : undefined} />
            {tabs.length > 1 && (
              <TabLinks label="Language" tabs={tabs.map((l) => ({
                href: `${base}/documents/${d.id}?lang=${l}#text`,
                label: l === original ? `${languageName(l)} · original` : languageName(l),
                active: l === lang,
              }))} />
            )}
          </div>
          <div className="px-5 pb-6 sm:px-6 sm:pb-8">
            {reading ? (
              <>
                {lang !== original && (
                  <div className="mb-5">
                    <Notice tone="info">Translated from {languageLabel(original)}. The {languageLabel(original)} original is the legal version.</Notice>
                  </div>
                )}
                <div lang={lang}><RichText text={reading} size="reading" /></div>
              </>
            ) : lang !== original ? (
              <Empty title={`No ${languageLabel(lang)} version yet`} icon={Languages}
                action={s.isAdmin
                  ? <Button href={`${base}/documents/${d.id}/edit#translations`} variant="secondary">Add a translation</Button>
                  : <Button href={`${base}/contacts`} variant="secondary">Contact the office</Button>}>
                {s.isAdmin ? "Paste the translated text so residents can read it." : "Ask the office for a translation."}
              </Empty>
            ) : d.storage_path ? (
              <Empty title="Open the file to read it" icon={BookOpenText}
                action={<Button href={`${base}/documents/${d.id}/file`} external variant="secondary"><ExternalLink aria-hidden className="size-4" /> Open</Button>}>
                The text of this document is not shown on screen yet.
              </Empty>
            ) : (
              <Empty title="Nothing to read yet" icon={BookOpenText}>
                {s.isAdmin ? "Add the file or paste the text with Edit." : "The office is still adding this document."}
              </Empty>
            )}
          </div>
          {missing.length > 0 && (reading || lang === original) && (
            <p className="flex items-start gap-2.5 border-t border-line px-5 py-4 text-sm text-muted sm:px-6">
              <Languages aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Not yet in {listWords(missing.map(languageName))}.{" "}
                {s.isAdmin
                  ? <Link href={`${base}/documents/${d.id}/edit#translations`} className="font-medium">Add a translation</Link>
                  : <Link href={`${base}/contacts`} className="font-medium">Ask the office for a translation</Link>}
              </span>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
