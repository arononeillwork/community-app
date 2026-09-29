import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ReportForm from "./ReportForm";

export const metadata = { title: "Report a problem" };

export default async function NewReportPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase.from("complaint_categories").select("id, name").eq("community_id", s.community.id).order("sort"),
    supabase.from("units").select("id, label").eq("community_id", s.community.id).order("label"),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report a problem" back={{ href: `/${s.community.slug}/report`, label: "My reports" }}
        intro="Tell us what is wrong. You can add photos. The office will reply here." />
      <ReportForm slug={s.community.slug} categories={categories ?? []} units={units ?? []} />
    </div>
  );
}
