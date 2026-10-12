import { Plus, Truck } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { Button, Empty } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import ViewPills from "@/components/finance/ViewPills";
import { fetchAll } from "@/components/finance/fetch-all";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { community } = await params;
  const { view } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/suppliers`;
  const yearStart = `${todayInput(s.community.timezone).slice(0, 4)}-01-01`;

  const [{ data: suppliers }, { data: spend }, invoices] = await Promise.all([
    supabase.from("suppliers").select("id, name, service_type, contact_name, phone, email, active").eq("community_id", c).order("name"),
    supabase.from("v_supplier_spend").select("id, active_contracts").eq("community_id", c),
    // Spend counts every invoice except disputed ones, the same rule as the overview and the budget.
    fetchAll<{ supplier_id: string; issue_date: string; total_cents: number }>((from, to) =>
      supabase.from("invoices").select("supplier_id, issue_date, total_cents").eq("community_id", c).neq("status", "disputed")
        .order("id").range(from, to)),
  ]);

  const contracts = new Map((spend ?? []).map((x) => [x.id as string, Number(x.active_contracts)]));
  const totals = new Map<string, { year: number; all: number }>();
  for (const i of invoices) {
    const t = totals.get(i.supplier_id) ?? { year: 0, all: 0 };
    t.all += Number(i.total_cents);
    if (i.issue_date >= yearStart) t.year += Number(i.total_cents);
    totals.set(i.supplier_id, t);
  }

  const all = (suppliers ?? []).map((x) => ({
    id: x.id, name: x.name, service_type: x.service_type, contact_name: x.contact_name, phone: x.phone, email: x.email,
    active: x.active as boolean,
    spend_year: totals.get(x.id)?.year ?? 0,
    spend_all: totals.get(x.id)?.all ?? 0,
    active_contracts: contracts.get(x.id) ?? 0,
  }));
  const inactive = all.filter((x) => !x.active);
  const showInactive = view === "inactive" && inactive.length > 0;
  const rows = all.filter((x) => x.active !== showInactive);

  const columns: Column[] = [
    { key: "name", header: "Supplier", href: `${base}/{id}`, subKey: "service_type", primary: true },
    { key: "phone", header: "Contact", subKey: "contact_name" },
    { key: "email", header: "Email", mobileHidden: true },
    { key: "spend_year", header: "This year", type: "money", total: true },
    { key: "spend_all", header: "All time", type: "money", total: true, mobileHidden: true },
    { key: "active_contracts", header: "Contracts", type: "number" },
  ];

  const addButton = <Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> Add supplier</Button>;

  return (
    <>
      <FinanceToolbar title="Suppliers" meta="Companies the community pays, what they cost and how to reach them." actions={addButton} />
      {all.length === 0 ? (
        <Empty icon={Truck} title="No suppliers yet" action={addButton}>
          Add the companies that work for the community, such as gardening, cleaning or the lift company.
        </Empty>
      ) : (
        <>
          {inactive.length > 0 && (
            <ViewPills label="Supplier views" views={[
              { href: base, label: "Current", active: !showInactive, count: all.length - inactive.length },
              { href: `${base}?view=inactive`, label: "No longer used", active: showInactive, count: inactive.length },
            ]} />
          )}
          {/* Phone numbers stay on one line in the table. */}
          <div className="[&_tbody_td:nth-child(2)]:whitespace-nowrap">
            <DataTable
              rows={rows}
              columns={columns}
              defaultSort={{ key: "spend_year", desc: true }}
              currency={s.community.currency}
              exportName={showInactive ? "suppliers-inactive" : "suppliers"}
              searchPlaceholder="Search name, service, contact…"
              empty="No suppliers match this search."
            />
          </div>
        </>
      )}
    </>
  );
}
