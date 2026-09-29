import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import ContractForm from "@/components/finance/register/ContractForm";
import { UUID } from "@/components/finance/register/form";
import { updateContract } from "../../actions";

export const metadata = { title: "Edit contract" };

type ContractRow = {
  id: string; supplier_id: string; category_id: string | null; title: string; start_date: string; end_date: string | null;
  notice_period_days: number; auto_renew: boolean; billing_frequency: string; amount_cents: number; vat_rate: number | string;
  price_review_clause: string | null; status: string; notes: string | null; file_path: string | null;
};

export default async function EditContractPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ data }, { data: suppliers }, { data: categories }] = await Promise.all([
    supabase.from("contracts")
      .select("id, supplier_id, category_id, title, start_date, end_date, notice_period_days, auto_renew, billing_frequency, amount_cents, vat_rate, price_review_clause, status, notes, file_path")
      .eq("id", id).eq("community_id", s.community.id).maybeSingle(),
    supabase.from("suppliers").select("id, name, active").eq("community_id", s.community.id).order("name"),
    supabase.from("expense_categories").select("id, name").eq("community_id", s.community.id).order("sort").order("name"),
  ]);
  if (!data) notFound();
  const c = data as unknown as ContractRow;
  const supplierList = ((suppliers ?? []) as { id: string; name: string; active: boolean }[])
    .filter((x) => x.active || x.id === c.supplier_id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit: ${c.title}`} back={{ href: `${base}/finance/contracts/${c.id}`, label: "Back to the contract" }} />
      <FinanceNav slug={s.community.slug} />
      <ContractForm
        action={updateContract.bind(null, s.community.slug, c.id)}
        suppliers={supplierList}
        categories={(categories ?? []) as { id: string; name: string }[]}
        currency={s.community.currency}
        hasFile={!!c.file_path}
        submitLabel="Save changes"
        cancelHref={`${base}/finance/contracts/${c.id}`}
        addSupplierHref={`${base}/finance/suppliers/new`}
        initial={{
          supplier_id: c.supplier_id,
          category_id: c.category_id ?? "",
          title: c.title,
          start_date: c.start_date,
          end_date: c.end_date ?? "",
          notice_period_days: String(c.notice_period_days),
          auto_renew: c.auto_renew,
          billing_frequency: c.billing_frequency,
          amount: centsToInput(c.amount_cents),
          vat_rate: String(Number(c.vat_rate)),
          price_review_clause: c.price_review_clause ?? "",
          status: c.status,
          notes: c.notes ?? "",
        }}
      />
    </div>
  );
}
