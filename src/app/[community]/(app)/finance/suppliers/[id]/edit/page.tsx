import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import FinanceHeader from "@/components/finance/FinanceHeader";
import SupplierForm from "../../SupplierForm";
import { updateSupplier } from "../../actions";
import { serviceTypes } from "../../service-types";

export const metadata = { title: "Edit supplier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditSupplierPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance/suppliers`;

  const [{ data: sup }, types] = await Promise.all([
    // iban_masked, never iban: the stored number stays out of the edit page (it can be changed or removed, not read).
    supabase.from("suppliers").select("id, name, service_type, tax_id, contact_name, email, phone, iban_masked, notes, active")
      .eq("community_id", s.community.id).eq("id", id).maybeSingle(),
    serviceTypes(supabase, s.community.id),
  ]);
  if (!sup) notFound();
  const { iban_masked, ...initial } = sup;

  return (
    <div className="max-w-3xl">
      <FinanceHeader title={`Edit ${sup.name}`} back={{ href: `${base}/${id}`, label: sup.name }} />
      <SupplierForm action={updateSupplier.bind(null, s.community.slug, id)} slug={s.community.slug} serviceTypes={types}
        initial={initial} maskedIban={iban_masked ?? null} editing cancelHref={`${base}/${id}`} submitLabel="Save changes" />
    </div>
  );
}
