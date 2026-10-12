import { Building2, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { Button, Card, Empty, Notice, PageHeader, SectionHeader } from "@/components/ui";
import FlatsTable from "@/components/admin/FlatsTable";
import { pct } from "@/components/admin/format";
import { loadBlocks, sharesAddUp } from "./data";

export const metadata = { title: "Blocks and flats" };

export default async function BlocksPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { community } = await params;
  const { saved } = await searchParams;
  const s = await requireAdmin(community);
  const slug = s.community.slug;
  const { blocks, loose, all, total } = await loadBlocks(s.community.id, s.community.timezone);

  const describe = (flats: typeof all) => {
    const share = flats.reduce((sum, f) => sum + f.coefficient, 0);
    const rented = flats.filter((f) => f.tenants.length).length;
    return [`${flats.length} ${flats.length === 1 ? "flat" : "flats"}`, `${pct(share)} share`, rented ? `${rented} rented` : null].filter(Boolean).join(" · ");
  };

  return (
    <>
      <PageHeader title="Blocks and flats" intro="Each flat's floor, size and share of the community costs."
        actions={<Button href={`/${slug}/admin/blocks/new`}><Plus aria-hidden className="size-4" /> Add a block</Button>} />

      <div className="flex flex-col gap-5">
        {saved && <Notice tone="ok">Flat {saved} saved.</Notice>}

        {all.length > 0 && (sharesAddUp(total) ? (
          <p className="text-[0.9375rem] text-muted">
            {all.length} flats in {blocks.length} {blocks.length === 1 ? "block" : "blocks"}. Shares add up to <span className="tabular text-ink">{pct(total)}</span>.
          </p>
        ) : (
          <Notice tone="warn" title={`Shares add up to ${pct(total)}`}>
            They should total 100 % so community fees are split fairly. Edit the flats whose share is wrong.
          </Notice>
        ))}

        {blocks.length === 0 && loose.length === 0 && (
          <Empty title="No blocks yet" icon={Building2} action={<Button href={`/${slug}/admin/blocks/new`}><Plus aria-hidden className="size-4" /> Add a block</Button>}>
            Add your first block, then add its flats.
          </Empty>
        )}

        {blocks.map((b) => (
          <Card key={b.id} padded={false} className="overflow-hidden">
            <div id={`block-${b.id}`} className="scroll-mt-24 p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Building2} title={b.name} description={describe(b.flats)}
                action={<Button href={`/${slug}/admin/blocks/${b.id}`} variant="secondary" size="sm">Edit block</Button>} />
            </div>
            {b.flats.length ? <FlatsTable flats={b.flats} slug={slug} /> : (
              <p className="border-t border-line px-5 py-4 text-[0.9375rem] text-muted sm:px-6">
                No flats yet. Use <span className="text-ink">Edit block</span> to add them.
              </p>
            )}
          </Card>
        ))}

        {loose.length > 0 && (
          <Card padded={false} className="overflow-hidden">
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Building2} title="Not in a block" description={describe(loose)} />
            </div>
            <FlatsTable flats={loose} slug={slug} />
          </Card>
        )}
      </div>
    </>
  );
}
