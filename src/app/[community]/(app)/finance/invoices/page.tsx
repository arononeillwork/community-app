import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, moneyShort, todayInput } from "@/lib/format";
import { Button, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import { approvalThreshold, approvalsText, daysBetween, plural, requiredApprovals } from "@/components/finance/invoice-utils";

export const metadata = { title: "Invoices" };

type InvoiceListRow = {
  id: string;
  invoice_number: string;
  supplier_name: string | null;
  category_name: string | null;
  contract_title: string | null;
  issue_date: string;
  due_date: string | null;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  status: string;
  paid_date: string | null;
  approvals: number | null;
  overdue: boolean | null;
};

const PAGE = 1000;

export default async function InvoicesPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const today = todayInput(s.community.timezone);
  const threshold = approvalThreshold(s.community.settings);

  // The API returns at most 1000 rows per request, so read in pages.
  const all: InvoiceListRow[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("v_invoice_list")
      .select("id, invoice_number, supplier_name, category_name, contract_title, issue_date, due_date, net_cents, vat_cents, total_cents, status, paid_date, approvals, overdue")
      .eq("community_id", s.community.id)
      .order("issue_date", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    all.push(...(data as InvoiceListRow[]));
    if (data.length < PAGE) break;
  }

  const rows = all.map((i) => {
    const required = requiredApprovals(i.total_cents, threshold);
    const overdueDays = i.overdue && i.due_date ? daysBetween(i.due_date, today) : 0;
    return {
      id: i.id,
      invoice_number: i.invoice_number,
      supplier_name: i.supplier_name ?? "Unknown supplier",
      contract_title: i.contract_title ?? "",
      category_name: i.category_name ?? "Uncategorised",
      issue_date: i.issue_date,
      due_date: i.due_date,
      due_note: i.overdue ? `Overdue by ${plural(Math.max(1, overdueDays), "day")}` : "",
      net_cents: Number(i.net_cents),
      vat_cents: Number(i.vat_cents),
      total_cents: Number(i.total_cents),
      status: i.status,
      paid_note: i.paid_date ? `Paid ${date(i.paid_date)}` : "",
      state: i.overdue ? "overdue" : i.status,
      approvals_text: approvalsText(i.approvals, required),
      paid_year: i.paid_date ? i.paid_date.slice(0, 4) : null,
    };
  });

  const columns: Column[] = [
    { key: "invoice_number", header: "Invoice no.", href: `${base}/finance/invoices/{id}`, primary: true, subKey: "contract_title" },
    { key: "supplier_name", header: "Supplier", filter: true },
    { key: "category_name", header: "Category", filter: true },
    { key: "issue_date", header: "Issued", type: "date" },
    { key: "due_date", header: "Due", type: "date", subKey: "due_note" },
    { key: "net_cents", header: "Net (before VAT)", type: "money", total: true, mobileHidden: true },
    { key: "vat_cents", header: "VAT", type: "money", total: true, mobileHidden: true },
    { key: "total_cents", header: "Total", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true, subKey: "paid_note" },
    { key: "state", header: "Current state", type: "status", filter: true },
    { key: "approvals_text", header: "Approvals" },
    { key: "paid_year", header: "Year paid", filter: true, mobileHidden: true },
  ];

  const year = today.slice(0, 4);

  return (
    <>
      <PageHeader
        title="Invoices"
        intro={<>Every bill from a supplier. <strong>Net</strong> is the price before VAT (tax); <strong>Total</strong> is what is paid. Invoices over {moneyShort(threshold, s.community.currency)} need 2 approvals, others need 1.</>}
        actions={<Button href={`${base}/finance/invoices/new`} size="lg">+ Add invoice</Button>}
      />
      <FinanceNav slug={s.community.slug} />
      <DataTable
        rows={rows}
        columns={columns}
        dateKey="issue_date"
        currency={s.community.currency}
        defaultSort={{ key: "issue_date", desc: true }}
        exportName="invoices"
        searchPlaceholder="Search invoice no., supplier, contract…"
        empty="No invoices match. Try clearing the filters."
        views={[
          { label: "Awaiting approval", params: { f_status: "received" } },
          { label: "Overdue", params: { f_state: "overdue" } },
          { label: "Paid this year", params: { f_status: "paid", f_paid_year: year } },
          { label: "Disputed", params: { f_status: "disputed" } },
        ]}
      />
    </>
  );
}
