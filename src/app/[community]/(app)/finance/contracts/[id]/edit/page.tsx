import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput } from "@/lib/format";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { displayFileName } from "@/components/finance-ops/dates";
import ContractForm from "../../ContractForm";

export const metadata = { title: "Edit contract" };

export default async function EditContractPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/contracts`;

  const [{ data: k }, { data: suppliers }, { data: categories }] = await Promise.all([
    supabase.from("contracts").select("*").eq("community_id", c).eq("id", id).maybeSingle(),
    supabase.from("suppliers").select("id, name, service_type, active").eq("community_id", c).order("name"),
    supabase.from("expense_categories").select("id, name").eq("community_id", c).order("sort"),
  ]);
  if (!k) notFound();

  // Inactive suppliers are hidden unless this contract already uses one.
  const options = (suppliers ?? []).filter((x) => x.active || x.id === k.supplier_id);

  return (
    <div className="max-w-3xl">
      <FinanceHeader title="Edit contract" back={{ href: `${base}/${k.id}`, label: k.title }} />
      <ContractForm
        slug={s.community.slug}
        contractId={k.id}
        initial={{
          supplier_id: k.supplier_id, new_supplier_name: "", new_supplier_service: "", title: k.title, category_id: k.category_id ?? "",
          start_date: k.start_date, end_date: k.end_date ?? "", notice_period_days: String(k.notice_period_days),
          auto_renew: k.auto_renew, billing_frequency: k.billing_frequency, amount: centsToInput(k.amount_cents),
          vat_rate: String(Number(k.vat_rate)), price_review_clause: k.price_review_clause ?? "", notes: k.notes ?? "",
        }}
        suppliers={options}
        categories={categories ?? []}
        currentFile={k.file_path ? displayFileName(k.file_path) : null}
        cancelHref={`${base}/${k.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
