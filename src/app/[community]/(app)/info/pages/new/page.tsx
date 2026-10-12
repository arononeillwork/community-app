import { requireAdmin } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import InfoPageForm from "../../InfoPageForm";

export const metadata = { title: "Add information" };

export default async function NewInfoPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add information" intro="Rules, opening hours or what to do when something goes wrong."
        back={{ href: `/${s.community.slug}/info`, label: "Bins & info" }} />
      <InfoPageForm slug={s.community.slug} id={null}
        initial={{ title: "", category: "general", icon: "info", body: "", visibility: "all", sort: "0" }} />
    </div>
  );
}
