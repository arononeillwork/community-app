import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import SupplierForm from "@/components/finance/register/SupplierForm";
import { createSupplier } from "../actions";

export const metadata = { title: "Add a supplier" };

export default async function NewSupplierPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const { data } = await supabase.from("suppliers").select("service_type").eq("community_id", s.community.id);
  const serviceTypes = Array.from(new Set(((data ?? []) as { service_type: string }[]).map((r) => r.service_type).filter(Boolean)));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a supplier" back={{ href: `${base}/finance/suppliers`, label: "Suppliers" }}
        intro="A supplier is a company that does work for the community, such as gardening or cleaning." />
      <FinanceNav slug={s.community.slug} />
      <SupplierForm
        action={createSupplier.bind(null, s.community.slug)}
        serviceTypes={serviceTypes}
        submitLabel="Save supplier"
        cancelHref={`${base}/finance/suppliers`}
        initial={{ name: "", service_type: "", contact_name: "", email: "", phone: "", website: "", address: "", tax_id: "", iban: "", notes: "" }}
      />
    </div>
  );
}
