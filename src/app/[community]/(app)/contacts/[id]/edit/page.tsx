import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { KEY_CONTACT_COLUMNS, type KeyContact } from "@/components/people/KeyContactLine";
import { UUID_RE } from "@/components/people/types";
import ContactForm from "../../ContactForm";
import DeleteContact from "../../DeleteContact";
import { loadFormOptions } from "../../formData";

export const metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;

  const [{ data }, { blocks, members }] = await Promise.all([
    supabase.from("key_contacts").select(KEY_CONTACT_COLUMNS).eq("id", id).eq("community_id", c).maybeSingle(),
    loadFormOptions(supabase, c),
  ]);
  const k = data as KeyContact | null;
  if (!k) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Edit contact" intro={k.name ? `${k.role_title} · ${k.name}` : k.role_title}
        back={{ href: `/${s.community.slug}/contacts`, label: "Key contacts" }} />
      <ContactForm
        slug={s.community.slug}
        id={k.id}
        initial={{
          role_title: k.role_title, contact_group: k.contact_group, building_id: k.building_id ?? "",
          // A linked person who has since left the community is shown as unlinked.
          profile_id: k.profile_id && members.some((m) => m.id === k.profile_id) ? k.profile_id : "",
          name: k.name ?? "", organisation: k.organisation ?? "", phone: k.phone ?? "", whatsapp: k.whatsapp ?? "",
          email: k.email ?? "", hours: k.hours ?? "", notes: k.notes ?? "", visibility: k.visibility, sort: String(k.sort),
        }}
        blocks={blocks}
        members={members}
      />
      <DeleteContact slug={s.community.slug} id={k.id} title={k.role_title} />
    </div>
  );
}
