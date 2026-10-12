import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ContactForm from "../ContactForm";
import { EMPTY_VALUES, loadFormOptions } from "../formData";

export const metadata = { title: "Add contact" };

export default async function NewContactPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const c = s.community.id;

  const [{ blocks, members }, { data: last }] = await Promise.all([
    loadFormOptions(supabase, c),
    supabase.from("key_contacts").select("sort").eq("community_id", c).order("sort", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add contact" intro="Someone residents may need to call." back={{ href: `/${s.community.slug}/contacts`, label: "Key contacts" }} />
      <ContactForm
        slug={s.community.slug}
        id={null}
        initial={{ ...EMPTY_VALUES, sort: String(Math.min(9999, (last?.sort ?? 0) + 1)) }}
        blocks={blocks}
        members={members}
      />
    </div>
  );
}
