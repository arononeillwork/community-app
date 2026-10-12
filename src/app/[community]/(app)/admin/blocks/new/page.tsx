import { requireAdmin } from "@/lib/community";
import { Card, PageHeader } from "@/components/ui";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { addBlock } from "../actions";

export const metadata = { title: "Add a block" };

export default async function NewBlockPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a block" back={{ href: `/${s.community.slug}/admin/blocks`, label: "Blocks and flats" }}
        intro="You can add its flats on the next page." />
      <Card>
        <ActionForm action={addBlock.bind(null, s.community.slug)} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="name">Name of the block</label>
            <input id="name" name="name" className="input" required maxLength={60} placeholder="e.g. Block D" autoComplete="off" />
            <p className="hint">Use the name residents know it by.</p>
          </div>
          <div><SubmitButton pendingLabel="Adding…">Add block</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
