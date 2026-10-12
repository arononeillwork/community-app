import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice, PageHeader, SectionHeader } from "@/components/ui";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import FlatFields from "@/components/admin/FlatFields";
import { pct } from "@/components/admin/format";
import { loadBlocks, sharesAddUp } from "../data";
import { addFlat, renameBlock } from "../actions";

export const metadata = { title: "Edit block" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BlockPage({ params, searchParams }: {
  params: Promise<{ community: string; buildingId: string }>;
  searchParams: Promise<{ created?: string; saved?: string; flat?: string }>;
}) {
  const { community, buildingId } = await params;
  const sp = await searchParams;
  const s = await requireAdmin(community);
  if (!UUID.test(buildingId)) notFound();
  const supabase = await createClient();
  const { data: block } = await supabase.from("buildings").select("id, name").eq("id", buildingId).eq("community_id", s.community.id).maybeSingle();
  if (!block) notFound();

  const slug = s.community.slug;
  const { blocks, total } = await loadBlocks(s.community.id, s.community.timezone);
  const flats = blocks.find((b) => b.id === block.id)?.flats ?? [];
  const blockShare = flats.reduce((sum, f) => sum + f.coefficient, 0);
  const prefix = /^Block\s+(\w+)$/i.exec(block.name)?.[1]?.toUpperCase();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={block.name} back={{ href: `/${slug}/admin/blocks`, label: "Blocks and flats" }}
        intro={flats.length ? `${flats.length} ${flats.length === 1 ? "flat" : "flats"} · ${pct(blockShare)} of the community costs` : "No flats yet."} />

      <div className="flex flex-col gap-5">
        {sp.created && <Notice tone="ok" title="Block added">Now add its flats below.</Notice>}
        {sp.saved === "name" && <Notice tone="ok">Name saved.</Notice>}
        {sp.saved === "flat" && <Notice tone="ok">Flat {sp.flat} added.{!sharesAddUp(total) && ` Shares now add up to ${pct(total)}; adjust them so they total 100 %.`}</Notice>}

        <Card>
          <ActionForm action={renameBlock.bind(null, slug, block.id)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="field flex-1">
              <label htmlFor="name">Name of the block</label>
              <input id="name" name="name" className="input" required maxLength={60} defaultValue={block.name} autoComplete="off" />
            </div>
            <SubmitButton variant="secondary" pendingLabel="Saving…">Save name</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <SectionHeader icon={Plus} title="Add a flat" description={`To ${block.name}`} />
          <ActionForm action={addFlat.bind(null, slug, block.id)} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="label">Flat name</label>
              <input id="label" name="label" className="input sm:max-w-xs" required maxLength={20} autoComplete="off"
                placeholder={prefix ? `e.g. ${prefix}-1A` : "e.g. 1A"} />
              <p className="hint">{prefix ? `Block letter, floor and door, like ${prefix}-2B.` : "As written on the door or in the deeds."}</p>
            </div>
            <FlatFields idPrefix="new" shareHint={`All flats together add up to ${pct(total)} now. Adjust the other flats afterwards if needed.`} />
            <div><SubmitButton pendingLabel="Adding…">Add flat</SubmitButton></div>
          </ActionForm>
        </Card>

        {flats.length > 0 && (
          <Card>
            <SectionHeader icon={Home} title="Flats in this block" description="Open one to change its floor, size or share" />
            <ul className="flex flex-wrap gap-2">
              {flats.map((f) => (
                <li key={f.id}>
                  <Link href={`/${slug}/admin/blocks/flats/${f.id}`}
                    className="inline-flex min-h-10 items-center rounded-[10px] border border-line bg-surface px-3.5 text-[0.9375rem] font-medium text-ink no-underline hover:border-brand-line hover:bg-surface-2">
                    {f.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
