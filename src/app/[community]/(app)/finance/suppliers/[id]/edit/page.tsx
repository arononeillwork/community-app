import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import { maskIban } from "@/components/finance/iban";
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
    supabase.from("suppliers").select("id, name, service_type, tax_id, contact_name, email, phone, iban, notes, active")
      .eq("community_id", s.community.id).eq("id", id).maybeSingle(),
    serviceTypes(supabase, s.community.id),
  ]);
  if (!sup) notFound();
  const { iban, ...initial } = sup;

  return (
    <div className="mx-auto max-w-3xl">
      <FinanceToolbar title={`Edit ${sup.name}`} back={{ href: `${base}/${id}`, label: "Supplier" }} />
      <SupplierForm action={updateSupplier.bind(null, s.community.slug, id)} slug={s.community.slug} serviceTypes={types}
        initial={initial} maskedIban={iban ? maskIban(iban) : null} editing cancelHref={`${base}/${id}`} submitLabel="Save changes" />
    </div>
  );
}
