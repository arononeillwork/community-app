import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { languageName } from "@/components/info/labels";
import UploadForm from "./UploadForm";

export const metadata = { title: "Upload document" };

export default async function NewDocumentPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const supabase = await createClient();

  const { data } = await supabase.from("documents").select("folder").eq("community_id", s.community.id);
  const folders = Array.from(new Set(["General", ...(data ?? []).map((d) => d.folder as string).filter(Boolean)]))
    .sort((a, b) => a.localeCompare(b));
  const codes = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  const languages = codes.map((code) => ({ code, name: languageName(code) }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Upload document" back={{ href: `/${s.community.slug}/documents`, label: "Documents" }}
        intro="Add a document for residents. You can choose who is allowed to see it." />
      <UploadForm slug={s.community.slug} folders={folders} languages={languages} defaultLanguage={s.community.default_language} />
    </div>
  );
}
