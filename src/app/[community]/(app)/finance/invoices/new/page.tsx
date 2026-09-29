import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { Button, Empty, PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import InvoiceForm, { type CategoryOpt, type ContractOpt, type SupplierOpt } from "./InvoiceForm";

export const metadata = { title: "Add an invoice" };

type ContractRaw = {
  id: string; title: string; status: string; supplier_id: string; category_id: string | null; vat_rate: number | string | null;
  supplier: { name: string } | { name: string }[] | null;
};

export default async function NewInvoicePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ supplier?: string; contract?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ data: suppliers }, { data: contracts }, { data: categories }] = await Promise.all([
    supabase.from("suppliers").select("id, name, active").eq("community_id", s.community.id).order("active", { ascending: false }).order("name"),
    supabase.from("contracts").select("id, title, status, supplier_id, category_id, vat_rate, supplier:suppliers(name)")
      .eq("community_id", s.community.id).order("title"),
    supabase.from("expense_categories").select("id, name").eq("community_id", s.community.id).order("sort").order("name"),
  ]);

  const supplierOpts = (suppliers ?? []) as SupplierOpt[];
  const contractOpts: ContractOpt[] = ((contracts ?? []) as ContractRaw[]).map((c) => {
    const sup = Array.isArray(c.supplier) ? c.supplier[0] : c.supplier;
    return {
      id: c.id, title: c.title, status: c.status, supplier_id: c.supplier_id, category_id: c.category_id,
      vat_rate: c.vat_rate == null ? null : Number(c.vat_rate),
      supplier_name: sup?.name ?? "Other supplier",
    };
  });

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Add an invoice"
        back={{ href: `${base}/finance/invoices`, label: "All invoices" }}
        intro="Type in a supplier invoice so the committee can approve and pay it. It will wait for approval once saved."
      />
      <FinanceNav slug={s.community.slug} />
      <div className="mx-auto w-full max-w-2xl">
        {supplierOpts.length === 0 ? (
          <Empty title="Add a supplier first">
            <p>Every invoice belongs to a supplier. Add the company that sent it, then come back here.</p>
            <div className="mt-4 flex justify-center">
              <Button href={`${base}/finance/suppliers`} size="lg">Go to suppliers</Button>
            </div>
          </Empty>
        ) : (
          <InvoiceForm
            slug={s.community.slug}
            suppliers={supplierOpts}
            contracts={contractOpts}
            categories={(categories ?? []) as CategoryOpt[]}
            today={todayInput(s.community.timezone)}
            currency={s.community.currency}
            defaultSupplierId={sp.supplier}
            defaultContractId={sp.contract}
          />
        )}
      </div>
    </div>
  );
}
