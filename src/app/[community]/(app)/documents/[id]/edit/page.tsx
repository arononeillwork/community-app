import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ConfirmDelete from "@/components/library/ConfirmDelete";
import { FOLDER_ORDER, UUID_RE, fileKind, formatBytes, languageLabel, languageName, sortFolders } from "@/components/library/meta";
import DocumentForm from "../../DocumentForm";
import Translations from "../../Translations";
import { deleteDocument } from "../../actions";

export const metadata = { title: "Edit document" };

export default async function EditDocumentPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ translation?: string; removed?: string }>;
}) {
  const { community, id } = await params;
  const sp = await searchParams;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;

  const [{ data: d }, { data: folderRows }, { data: tr }] = await Promise.all([
    supabase.from("documents")
      .select("id, title, folder, description, storage_path, mime_type, size_bytes, visibility, original_language, extracted_text")
      .eq("id", id).eq("community_id", c).maybeSingle(),
    supabase.from("documents").select("folder").eq("community_id", c),
    supabase.from("document_translations").select("language, translated_text, status").eq("document_id", id).eq("community_id", c).order("language"),
  ]);
  if (!d) notFound();

  const folders = sortFolders([...FOLDER_ORDER, ...(folderRows ?? []).map((r) => r.folder as string)]);
  const enabled = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  const languages = [...new Set([...enabled, d.original_language as string])].map((code) => ({ code, name: languageName(code) }));
  const rows = (tr ?? []).map((t) => ({ language: t.language as string, name: languageName(t.language), status: t.status as string, text: (t.translated_text as string | null) ?? "" }));
  const missing = enabled.filter((l) => l !== d.original_language && !rows.some((r) => r.language === l)).map((code) => ({ code, name: languageName(code) }));
  const notice = sp.translation ? `${sp.translation} translation saved.` : sp.removed ? `${sp.removed} translation removed.` : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit document" intro={d.title} back={{ href: `/${s.community.slug}/documents/${d.id}`, label: "Back to the document" }} />
      <div className="flex flex-col gap-5">
        <DocumentForm slug={s.community.slug} id={d.id} folders={folders} languages={languages}
          currentFile={d.storage_path ? { kind: fileKind(d.mime_type, d.storage_path).label, size: formatBytes(d.size_bytes) } : null}
          initial={{
            title: d.title, folder: d.folder, new_folder: "", description: d.description ?? "", visibility: d.visibility,
            original_language: d.original_language, extracted_text: d.extracted_text ?? "",
          }} />
        <Translations slug={s.community.slug} documentId={d.id} originalName={languageLabel(d.original_language)} rows={rows} missing={missing} notice={notice} />
        <ConfirmDelete action={deleteDocument.bind(null, s.community.slug, d.id)} title="Delete document"
          description={d.storage_path ? "The file and its translations are deleted too." : "Its translations are deleted too."}
          label="Delete document" question={`Delete “${d.title}”? This cannot be undone.`} />
      </div>
    </div>
  );
}
