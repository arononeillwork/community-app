import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";

export const metadata = { title: "Suppliers" };

type SpendRow = {
  id: string; name: string; service_type: string; email: string | null; phone: string | null; active: boolean;
  active_contracts: number; spend_this_year_cents: number; spend_all_time_cents: number;
};

export default async function SuppliersPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const { data } = await supabase
    .from("v_supplier_spend")
    .select("id, name, service_type, email, phone, active, active_contracts, spend_this_year_cents, spend_all_time_cents")
    .eq("community_id", s.community.id);

  const rows = ((data ?? []) as unknown as SpendRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    service_type: r.service_type,
    phone: r.phone,
    email: r.email,
    active_contracts: Number(r.active_contracts ?? 0),
    spend_this_year_cents: Number(r.spend_this_year_cents ?? 0),
    spend_all_time_cents: Number(r.spend_all_time_cents ?? 0),
    active: r.active ? "active" : "inactive",
  }));

  const columns: Column[] = [
    { key: "name", header: "Supplier", href: `${base}/finance/suppliers/{id}`, primary: true },
    { key: "service_type", header: "Service", filter: true },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email", mobileHidden: true },
    { key: "active_contracts", header: "Active contracts", type: "number" },
    { key: "spend_this_year_cents", header: "Spent this year", type: "money", total: true },
    { key: "spend_all_time_cents", header: "Spent in total", type: "money", total: true, mobileHidden: true },
    { key: "active", header: "Status", type: "status", filter: true },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        intro="The companies that work for the community. Spending is the total of their invoices, including VAT (tax)."
        actions={<Button href={`${base}/finance/suppliers/new`} size="lg">+ Add supplier</Button>}
      />
      <FinanceNav slug={s.community.slug} />
      <DataTable
        rows={rows}
        columns={columns}
        currency={s.community.currency}
        defaultSort={{ key: "name" }}
        exportName="suppliers"
        searchPlaceholder="Search suppliers…"
        empty="No suppliers yet. Tap “Add supplier” to add the first one."
        views={[
          { label: "Active suppliers", params: { f_active: "active" } },
          { label: "Inactive", params: { f_active: "inactive" } },
        ]}
      />
    </>
  );
}
