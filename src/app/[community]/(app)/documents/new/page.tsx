import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FOLDER_ORDER, languageName, sortFolders } from "@/components/library/meta";
import DocumentForm from "../DocumentForm";

export const metadata = { title: "Upload document" };

export default async function NewDocumentPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { community } = await params;
  const { folder } = await searchParams;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("folder").eq("community_id", s.community.id);
  const folders = sortFolders([...FOLDER_ORDER, ...(data ?? []).map((d) => d.folder as string)]);
  const languages = (s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language])
    .map((code) => ({ code, name: languageName(code) }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Upload document" intro="It is saved privately. Only the people you choose can open it."
        back={{ href: `/${s.community.slug}/documents`, label: "Documents" }} />
      <DocumentForm slug={s.community.slug} id={null} folders={folders} languages={languages} currentFile={null}
        initial={{
          title: "", folder: folders.includes(folder ?? "") ? folder! : "General", new_folder: "", description: "",
          visibility: "all", original_language: s.community.default_language, extracted_text: "",
        }} />
    </div>
  );
}
