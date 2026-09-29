import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import SupplierForm from "@/components/finance/register/SupplierForm";
import { UUID } from "@/components/finance/register/form";
import { updateSupplier } from "../../actions";

export const metadata = { title: "Edit supplier" };

type SupplierRow = {
  id: string; name: string; service_type: string; contact_name: string | null; email: string | null; phone: string | null;
  website: string | null; address: string | null; tax_id: string | null; iban: string | null; notes: string | null;
};

export default async function EditSupplierPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ data }, { data: types }] = await Promise.all([
    supabase.from("suppliers")
      .select("id, name, service_type, contact_name, email, phone, website, address, tax_id, iban, notes")
      .eq("id", id).eq("community_id", s.community.id).maybeSingle(),
    supabase.from("suppliers").select("service_type").eq("community_id", s.community.id),
  ]);
  if (!data) notFound();
  const sup = data as unknown as SupplierRow;
  const serviceTypes = Array.from(new Set(((types ?? []) as { service_type: string }[]).map((r) => r.service_type).filter(Boolean)));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit: ${sup.name}`} back={{ href: `${base}/finance/suppliers/${sup.id}`, label: "Back to the supplier" }} />
      <FinanceNav slug={s.community.slug} />
      <SupplierForm
        action={updateSupplier.bind(null, s.community.slug, sup.id)}
        serviceTypes={serviceTypes}
        submitLabel="Save changes"
        cancelHref={`${base}/finance/suppliers/${sup.id}`}
        initial={{
          name: sup.name, service_type: sup.service_type, contact_name: sup.contact_name ?? "", email: sup.email ?? "",
          phone: sup.phone ?? "", website: sup.website ?? "", address: sup.address ?? "", tax_id: sup.tax_id ?? "",
          iban: sup.iban ?? "", notes: sup.notes ?? "",
        }}
      />
    </div>
  );
}
