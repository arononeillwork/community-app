import { requireAdmin } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import InviteForm from "@/components/admin/InviteForm";
import { dayInput } from "@/components/admin/format";
import { invitePerson } from "../actions";
import { flatsByBlock } from "../flats";

export const metadata = { title: "Invite someone" };

export default async function InvitePage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const blocks = await flatsByBlock(s.community.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Invite someone" back={{ href: `/${s.community.slug}/admin/people`, label: "People" }}
        intro={`Add a resident, landlord or helper to ${s.community.name}.`} />
      <InviteForm action={invitePerson.bind(null, s.community.slug)} blocks={blocks} today={dayInput(s.community.timezone)} />
    </div>
  );
}
