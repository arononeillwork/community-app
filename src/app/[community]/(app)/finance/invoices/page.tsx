import { Plus, Receipt } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { Button, Empty } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import ViewPills from "@/components/finance/ViewPills";
import { fetchAll } from "@/components/finance/fetch-all";
import { isOverdue } from "@/components/finance/dates";

export const metadata = { title: "Invoices" };

type Row = {
  id: string; invoice_number: string; supplier_name: string; category_name: string | null; contract_title: string | null;
  issue_date: string; due_date: string | null; net_cents: number; vat_cents: number; total_cents: number;
  status: string; overdue: boolean; approvals: number;
};

const VIEWS: { key: string; label: string; empty: string; match: (r: Row, yearStart: string) => boolean }[] = [
  { key: "", label: "All", empty: "No invoices match these filters.", match: () => true },
  { key: "received", label: "Awaiting approval", empty: "No invoices are waiting for approval.", match: (r) => r.status === "received" },
  { key: "approved", label: "Approved", empty: "No approved invoices are waiting to be paid.", match: (r) => r.status === "approved" },
  { key: "unpaid", label: "Unpaid", empty: "Every invoice is paid.", match: (r) => r.status === "received" || r.status === "approved" },
  { key: "overdue", label: "Overdue", empty: "No invoices are overdue.", match: (r) => r.overdue },
  { key: "paid", label: "Paid", empty: "No paid invoices yet.", match: (r) => r.status === "paid" },
  { key: "disputed", label: "Disputed", empty: "No disputed invoices.", match: (r) => r.status === "disputed" },
  { key: "year", label: "This year", empty: "No invoices this year yet.", match: (r, yearStart) => r.issue_date >= yearStart },
];

export default async function InvoicesPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { community } = await params;
  const { view = "" } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance/invoices`;
  const today = todayInput(s.community.timezone);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const fetched = await fetchAll<Row>((from, to) => supabase
    .from("v_invoice_list")
    .select("id, invoice_number, supplier_name, category_name, contract_title, issue_date, due_date, net_cents, vat_cents, total_cents, status, overdue, approvals")
    .eq("community_id", s.community.id)
    .order("issue_date", { ascending: false }).order("id")
    .range(from, to));
  // Overdue by the community's calendar (the view uses the database server's date).
  const all = fetched.map((r) => ({ ...r, overdue: isOverdue(r.status, r.due_date, today) }));
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const rows = all.filter((r) => current.match(r, yearStart)).map((r) => ({ ...r, category_name: r.category_name ?? "Uncategorised" }));

  const columns: Column[] = [
    { key: "invoice_number", header: "Invoice", href: `${base}/{id}` },
    { key: "supplier_name", header: "Supplier", filter: true },
    { key: "category_name", header: "Category", filter: true, mobileHidden: true },
    { key: "issue_date", header: "Issued", type: "date" },
    { key: "due_date", header: "Due", type: "date" },
    { key: "total_cents", header: "Total", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  const addButton = <Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> Add invoice</Button>;

  return (
    <>
      <FinanceToolbar title="Invoices" meta="Supplier bills, from approval to payment." actions={addButton} />
      {all.length === 0 ? (
        <Empty icon={Receipt} title="No invoices yet" action={addButton}>
          Add the first supplier invoice. It is then approved, paid, and counted against the budget.
        </Empty>
      ) : (
        <>
          <ViewPills label="Invoice views" views={VIEWS.map((v) => ({
            href: v.key ? `${base}?view=${v.key}` : base,
            label: v.label,
            active: v.key === current.key,
            // "All" has no count: the table footer already shows the total, and the pills then fit one row at laptop width.
            count: v.key ? all.filter((r) => v.match(r, yearStart)).length : undefined,
          }))} />
          {/* Invoice numbers stay on one line in the table. */}
          <div className="[&_tbody_td:first-child]:whitespace-nowrap">
            <DataTable
              rows={rows}
              columns={columns}
              dateKey="issue_date"
              defaultSort={{ key: "issue_date", desc: true }}
              currency={s.community.currency}
              exportName={`invoices${current.key ? `-${current.key}` : ""}`}
              searchPlaceholder="Search number, supplier, category…"
              empty={current.empty}
            />
          </div>
        </>
      )}
    </>
  );
}
