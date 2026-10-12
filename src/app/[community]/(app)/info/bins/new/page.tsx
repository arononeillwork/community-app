import { requireAdmin } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import BinForm from "../../BinForm";

export const metadata = { title: "Add a bin" };

export default async function NewBinPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a bin" intro="Its colour, collection days and where it is."
        back={{ href: `/${s.community.slug}/info`, label: "Bins & info" }} />
      <BinForm slug={s.community.slug} id={null}
        initial={{ bin_type: "", color: "", color_hex: "#64748b", weekdays: [], put_out_time: "", location: "", notes: "", sort: "0" }} />
    </div>
  );
}
