import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ConfirmDelete from "@/components/library/ConfirmDelete";
import { INFO_CATEGORY_KEYS, INFO_ICON_KEYS, UUID_RE } from "@/components/library/meta";
import InfoPageForm from "../../../InfoPageForm";
import { deleteInfoPage } from "../../../actions";

export const metadata = { title: "Edit information" };

export default async function EditInfoPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase.from("info_pages").select("id, title, body, category, icon, sort, visibility")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!p) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Edit information" intro={p.title} back={{ href: `/${s.community.slug}/info`, label: "Bins & info" }} />
      <InfoPageForm slug={s.community.slug} id={p.id}
        initial={{
          title: p.title,
          // Older rows may use a section or icon the form does not offer; fall back to the defaults.
          category: INFO_CATEGORY_KEYS.includes(p.category) ? p.category : "general",
          icon: INFO_ICON_KEYS.includes(p.icon) ? p.icon : "info",
          body: p.body, visibility: p.visibility, sort: String(p.sort),
        }} />
      <ConfirmDelete action={deleteInfoPage.bind(null, s.community.slug, p.id)} title="Delete information"
        description="Residents will no longer see it." label="Delete information" question={`Delete “${p.title}”? This cannot be undone.`} />
    </div>
  );
}
