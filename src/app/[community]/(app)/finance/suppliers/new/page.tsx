import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import SupplierForm from "../SupplierForm";
import { createSupplier } from "../actions";
import { serviceTypes } from "../service-types";

export const metadata = { title: "Add supplier" };

export default async function NewSupplierPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance/suppliers`;
  const types = await serviceTypes(supabase, s.community.id);

  return (
    <div className="mx-auto max-w-3xl">
      <FinanceToolbar title="Add a supplier" meta="A company that works for the community." back={{ href: base, label: "Suppliers" }} />
      <SupplierForm action={createSupplier.bind(null, s.community.slug)} slug={s.community.slug} serviceTypes={types}
        cancelHref={base} submitLabel="Save supplier" />
    </div>
  );
}
