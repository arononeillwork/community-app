import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ConfirmDelete from "@/components/library/ConfirmDelete";
import { UUID_RE } from "@/components/library/meta";
import BinForm from "../../../BinForm";
import { deleteBin } from "../../../actions";

export const metadata = { title: "Edit bin" };

export default async function EditBinPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: b } = await supabase.from("bin_schedules")
    .select("id, bin_type, color, color_hex, weekdays, put_out_time, location, notes, sort")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!b) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Edit bin" intro={b.bin_type} back={{ href: `/${s.community.slug}/info`, label: "Bins & info" }} />
      <BinForm slug={s.community.slug} id={b.id}
        initial={{
          bin_type: b.bin_type, color: b.color, color_hex: b.color_hex, weekdays: b.weekdays ?? [],
          put_out_time: b.put_out_time ?? "", location: b.location ?? "", notes: b.notes ?? "", sort: String(b.sort),
        }} />
      <ConfirmDelete action={deleteBin.bind(null, s.community.slug, b.id)} title="Delete bin"
        description="It disappears from the bin days and the home page." label="Delete bin" question={`Delete “${b.bin_type}”? This cannot be undone.`} />
    </div>
  );
}
