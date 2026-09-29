import { notFound } from "next/navigation";
import { Download, Eye, FileText, Languages, Landmark } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { Badge, Card, Notice, PageHeader, type Tone } from "@/components/ui";
import LinkButton from "@/components/info/LinkButton";
import { VISIBILITY_HINTS, fileKind, fileSize, languageName, visibilityWord } from "@/components/info/labels";

export const metadata = { title: "Document" };

type Doc = {
  id: string; title: string; folder: string; description: string | null; storage_path: string | null;
  mime_type: string | null; size_bytes: number | null; visibility: string; original_language: string;
  extracted_text: string | null; created_at: string;
};
type Translation = { language: string; status: string; translated_text: string | null };

const TRANSLATION_STATUS: Record<string, { tone: Tone; word: string }> = {
  pending: { tone: "warn", word: "Being prepared" },
  failed: { tone: "bad", word: "Could not be translated" },
  none: { tone: "neutral", word: "Not available yet" },
};

export default async function DocumentDetail({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ added?: string; error?: string }>;
}) {
  const { community, id } = await params;
  const { added, error } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  // RLS hides documents this person may not see, so "not found" also covers "not allowed".
  const { data } = await supabase
    .from("documents")
    .select("id, title, folder, description, storage_path, mime_type, size_bytes, visibility, original_language, extracted_text, created_at")
    .eq("id", id)
    .eq("community_id", s.community.id)
    .maybeSingle();
  if (!data) notFound();
  const doc = data as Doc;

  const { data: trData } = await supabase
    .from("document_translations")
    .select("language, status, translated_text")
    .eq("document_id", doc.id);
  const translations = new Map(((trData ?? []) as Translation[]).map((t) => [t.language, t]));

  const enabled = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  const otherLanguages = enabled.filter((l) => l !== doc.original_language);
  const kind = fileKind(doc.mime_type, doc.storage_path);
  const size = fileSize(doc.size_bytes);
  const downloadHref = `${base}/documents/${doc.id}/download`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={doc.title} back={{ href: `${base}/documents`, label: "Documents" }} />
      {added && <Notice tone="ok">The document has been added.</Notice>}
      {error === "file" && (
        <Notice tone="bad">Sorry, the file could not be opened just now. Please try again, or ask the community office for a copy.</Notice>
      )}

      <Card className="flex flex-col gap-4">
        {doc.description && <p className="whitespace-pre-line text-lg">{doc.description}</p>}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="font-bold">Folder</dt><dd>{doc.folder || "General"}</dd>
          <dt className="font-bold">Who can see it</dt>
          <dd><Badge tone={doc.visibility === "all" ? "ok" : "info"}>{visibilityWord(doc.visibility)}</Badge>
            <span className="ml-2 text-muted">{VISIBILITY_HINTS[doc.visibility] ?? ""}</span></dd>
          <dt className="font-bold">Written in</dt><dd>{languageName(doc.original_language)}</dd>
          <dt className="font-bold">Added</dt><dd>{date(doc.created_at)}</dd>
          {doc.storage_path && (<><dt className="font-bold">File</dt><dd>{kind}{size ? `, ${size}` : ""}</dd></>)}
        </dl>

        {doc.storage_path ? (
          <div className="no-print flex flex-wrap gap-3">
            <LinkButton href={downloadHref} variant="primary" size="lg"><Download aria-hidden className="size-6" /> Download</LinkButton>
            <LinkButton href={`${downloadHref}?view=1`} external><Eye aria-hidden className="size-5" /> View in the browser</LinkButton>
          </div>
        ) : (
          <p className="flex items-start gap-3 rounded-xl border-2 border-line bg-bg p-4 text-lg font-bold">
            <Landmark aria-hidden className="mt-1 size-6 shrink-0" />
            Paper copy available from the community office.
          </p>
        )}
      </Card>

      {doc.extracted_text && (
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold"><FileText aria-hidden className="size-6" /> Text of the document</h2>
          <div tabIndex={0} role="region" aria-label="Text of the document"
            className="max-h-[36rem] overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-bg p-5 text-lg leading-relaxed">
            {doc.extracted_text}
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Languages aria-hidden className="size-6" /> Read in another language</h2>
        {otherLanguages.length === 0 ? (
          <p>This community uses only one language, so no translations are needed.</p>
        ) : (
          <>
            <p>
              This document is written in {languageName(doc.original_language)}. Translations appear here when they are ready.
            </p>
            <ul className="flex flex-col gap-3">
              {otherLanguages.map((code) => {
                const t = translations.get(code);
                const name = languageName(code);
                if (t?.status === "done" && t.translated_text) {
                  return (
                    <li key={code}>
                      <details className="group rounded-xl border-2 border-line">
                        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 font-bold">
                          <span>Read in {name}</span>
                          <Badge tone="ok">Ready</Badge>
                        </summary>
                        <div lang={code} tabIndex={0} role="region" aria-label={`Text in ${name}`}
                          className="max-h-[36rem] overflow-y-auto whitespace-pre-line border-t border-line bg-bg p-5 text-lg leading-relaxed">
                          {t.translated_text}
                        </div>
                      </details>
                    </li>
                  );
                }
                const st = TRANSLATION_STATUS[t?.status ?? "none"] ?? TRANSLATION_STATUS.none;
                return (
                  <li key={code} className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-line px-4 py-2">
                    <span className="font-bold">{name}</span>
                    <Badge tone={st.tone}>{st.word}</Badge>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2 rounded-xl bg-info-soft p-4">
              <button type="button" disabled aria-describedby="translate-soon"
                className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-muted disabled:cursor-not-allowed">
                <Languages aria-hidden className="size-5" /> Translate automatically – coming soon
              </button>
              <p id="translate-soon" className="text-ink">
                Automatic translation arrives with the community assistant, which is not ready yet. Until then, the community office can help you understand this document.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
