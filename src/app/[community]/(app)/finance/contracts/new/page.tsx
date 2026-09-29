import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents, centsToInput, todayInput } from "@/lib/format";
import { Button, Empty, PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import ContractForm from "@/components/finance/register/ContractForm";
import { isFrequency } from "@/components/finance/register/dates";
import { createContract } from "../actions";

export const metadata = { title: "Add a contract" };

export default async function NewContractPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ supplier?: string; title?: string; amount?: string; frequency?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ data: suppliers }, { data: categories }] = await Promise.all([
    supabase.from("suppliers").select("id, name, active").eq("community_id", s.community.id).order("name"),
    supabase.from("expense_categories").select("id, name").eq("community_id", s.community.id).order("sort").order("name"),
  ]);
  const supplierList = ((suppliers ?? []) as { id: string; name: string; active: boolean }[]);
  // Pre-fill from a chosen quote (?supplier=…&title=…&amount=…&frequency=one_off).
  const prefillSupplier = supplierList.find((x) => x.id === sp.supplier)?.id ?? "";
  const prefillAmount = parseEurosToCents(sp.amount ?? null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a contract" back={{ href: `${base}/finance/contracts`, label: "Contracts" }}
        intro="Fill in what the contract says. You can change it later." />
      <FinanceNav slug={s.community.slug} />
      {supplierList.length === 0 ? (
        <Empty title="Add a supplier first">
          <p className="mb-4">Every contract is with a supplier (a company). There are no suppliers yet.</p>
          <Button href={`${base}/finance/suppliers/new`} size="lg">+ Add supplier</Button>
        </Empty>
      ) : (
        <ContractForm
          action={createContract.bind(null, s.community.slug)}
          suppliers={supplierList.filter((x) => x.active || x.id === prefillSupplier)}
          categories={(categories ?? []) as { id: string; name: string }[]}
          currency={s.community.currency}
          hasFile={false}
          submitLabel="Save contract"
          cancelHref={`${base}/finance/contracts`}
          addSupplierHref={`${base}/finance/suppliers/new`}
          initial={{
            supplier_id: prefillSupplier,
            category_id: "",
            title: (sp.title ?? "").slice(0, 200),
            start_date: todayInput(s.community.timezone),
            end_date: "",
            notice_period_days: "30",
            auto_renew: false,
            billing_frequency: sp.frequency && isFrequency(sp.frequency) ? sp.frequency : "monthly",
            amount: prefillAmount != null && prefillAmount >= 0 ? centsToInput(prefillAmount) : "",
            vat_rate: "21",
            price_review_clause: "",
            status: "active",
            notes: "",
          }}
        />
      )}
    </div>
  );
}
