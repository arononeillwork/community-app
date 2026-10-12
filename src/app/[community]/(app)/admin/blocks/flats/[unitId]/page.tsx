import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Home, Users } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { Card, PageHeader, SectionHeader } from "@/components/ui";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import FlatFields from "@/components/admin/FlatFields";
import { pct } from "@/components/admin/format";
import { loadBlocks, sharesAddUp } from "../../data";
import { updateFlat } from "../../actions";

export const metadata = { title: "Edit flat" };

export default async function FlatEditPage({ params }: { params: Promise<{ community: string; unitId: string }> }) {
  const { community, unitId } = await params;
  const s = await requireAdmin(community);
  const slug = s.community.slug;
  const { blocks, all, total } = await loadBlocks(s.community.id, s.community.timezone);
  const flat = all.find((f) => f.id === unitId);
  if (!flat) notFound();
  const block = blocks.find((b) => b.id === flat.buildingId);
  const others = total - flat.coefficient;
  const fits = Math.max(0, 100 - others);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Flat ${flat.label}`} eyebrow={block?.name}
        back={{ href: `/${slug}/admin/blocks${block ? `#block-${block.id}` : ""}`, label: "Blocks and flats" }} />

      <div className="flex flex-col gap-5">
        <Card>
          <SectionHeader icon={Home} title="Details" />
          <ActionForm action={updateFlat.bind(null, slug, flat.id)} className="flex flex-col gap-4">
            <FlatFields idPrefix="edit" floor={flat.floor} bedrooms={flat.bedrooms} coefficient={flat.coefficient}
              shareHint={sharesAddUp(total)
                ? `All flats together add up to ${pct(total)}. If you change this share, adjust another flat so they still total 100 %.`
                : `The other flats add up to ${pct(others, 4)}, so ${pct(fits, 4)} here would make 100 %.`} />
            <div><SubmitButton pendingLabel="Saving…">Save flat</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card>
          <SectionHeader icon={Users} title="Who lives here" />
          <ul className="flex flex-col gap-2 text-[0.9375rem]">
            {flat.owners.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <Link href={`/${slug}/admin/people/${p.id}`} className="font-medium no-underline hover:underline">{p.name}</Link>
                <span className="text-muted">Owner</span>
              </li>
            ))}
            {flat.tenants.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <Link href={`/${slug}/admin/people/${p.id}`} className="font-medium no-underline hover:underline">{p.name}</Link>
                <span className="text-muted">Tenant</span>
              </li>
            ))}
            {!flat.owners.length && !flat.tenants.length && <li className="text-muted">Nobody is linked to this flat yet. Link an owner from their page under People.</li>}
          </ul>
          <Link href={`/${slug}/members/flat/${flat.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium no-underline hover:underline">
            Open the flat page <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
