import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import FinanceHeader from "@/components/finance/FinanceHeader";
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
    <div className="max-w-3xl">
      <FinanceHeader title="Add a supplier" intro="A company that works for the community." back={{ href: base, label: "Suppliers" }} />
      <SupplierForm action={createSupplier.bind(null, s.community.slug)} slug={s.community.slug} serviceTypes={types}
        cancelHref={base} submitLabel="Save supplier" />
    </div>
  );
}
