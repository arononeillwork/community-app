import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { moneyShort, todayInput } from "@/lib/format";
import { Button, Card, PageHeader, Stat } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import { NOTICE_WARNING_DAYS, noticeStatus } from "@/components/finance/register/dates";

export const metadata = { title: "Contracts" };

type KeyDates = {
  id: string; title: string; status: string; supplier_name: string; service_type: string | null; category_name: string | null;
  start_date: string; end_date: string | null; length_months: number | null; notice_period_days: number;
  notice_deadline: string | null; auto_renew: boolean; billing_frequency: string; annual_cost_cents: number | null;
};

export default async function ContractsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const today = todayInput(s.community.timezone);

  const { data } = await supabase
    .from("v_contract_key_dates")
    .select("id, title, status, supplier_name, service_type, category_name, start_date, end_date, length_months, notice_period_days, notice_deadline, auto_renew, billing_frequency, annual_cost_cents")
    .eq("community_id", s.community.id);

  const rows = ((data ?? []) as unknown as KeyDates[]).map((c) => ({
    id: c.id,
    title: c.title,
    supplier: c.supplier_name,
    category: c.category_name ?? "No category",
    start_date: c.start_date,
    // undefined (not null) so rolling contracts sort last in the table
    end_date: c.end_date ?? undefined,
    length_months: c.length_months ?? undefined,
    notice_period_days: c.notice_period_days,
    notice_deadline: c.notice_deadline ?? undefined,
    notice: noticeStatus(c.status, c.end_date, c.notice_deadline, today),
    auto_renew: c.auto_renew ? "Yes" : "No",
    billing_frequency: c.billing_frequency,
    annual_cost_cents: c.annual_cost_cents == null ? null : Number(c.annual_cost_cents),
    status: c.status,
  }));

  const active = rows.filter((r) => r.status === "active");
  const dueSoon = rows.filter((r) => r.notice === "due_soon").length;
  const overdue = rows.filter((r) => r.notice === "overdue").length;
  const activeCost = active.reduce((sum, r) => sum + (r.annual_cost_cents ?? 0), 0);

  const columns: Column[] = [
    { key: "title", header: "Contract", href: `${base}/finance/contracts/{id}`, primary: true },
    { key: "supplier", header: "Supplier", filter: true },
    { key: "category", header: "Category", filter: true },
    { key: "start_date", header: "Start", type: "date", mobileHidden: true },
    { key: "end_date", header: "End", type: "date" },
    { key: "length_months", header: "Length (months)", type: "number", mobileHidden: true },
    { key: "notice_period_days", header: "Notice period (days)", type: "number", mobileHidden: true },
    { key: "notice_deadline", header: "Notice deadline", type: "date" },
    { key: "notice", header: "Notice", type: "status", filter: true },
    { key: "auto_renew", header: "Auto-renew", filter: true },
    { key: "billing_frequency", header: "Billing", filter: true, mobileHidden: true },
    { key: "annual_cost_cents", header: "Annual cost (excl. VAT)", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  return (
    <>
      <PageHeader
        title="Contracts"
        intro="Every contract the community has with a company, with the dates that matter."
        actions={<Button href={`${base}/finance/contracts/new`} size="lg">+ Add contract</Button>}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active contracts" value={active.length} />
        <Stat label="Cost per year (active)" value={moneyShort(activeCost, s.community.currency)} sub="Without VAT" />
        <Stat label={`Notice due in ${NOTICE_WARNING_DAYS} days`} value={dueSoon} tone={dueSoon ? "warn" : undefined}
          href={`${base}/finance/contracts?f_notice=due_soon`} sub={dueSoon ? "Decide soon: keep, change or end" : "Nothing due soon"} />
        <Stat label="Notice deadline passed" value={overdue} tone={overdue ? "bad" : undefined}
          href={`${base}/finance/contracts?f_notice=overdue`} sub={overdue ? "Check these contracts" : "None"} />
      </div>

      <Card className="mb-6 !bg-info-soft">
        <h2 className="mb-2 text-xl font-bold">What the words mean</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="font-bold">Notice deadline</dt>
          <dd>The notice deadline is the last day you can tell the company you want to end or renegotiate the contract.</dd>
          <dt className="font-bold">Notice period</dt>
          <dd>How many days before the end date you must tell them.</dd>
          <dt className="font-bold">Auto-renew</dt>
          <dd>The contract starts again automatically unless you give notice in time.</dd>
          <dt className="font-bold">Rolling</dt>
          <dd>The contract has no end date. It continues until someone gives notice.</dd>
          <dt className="font-bold">Annual cost</dt>
          <dd>What the contract costs in a year, without VAT (tax).</dd>
        </dl>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        dateKey="notice_deadline"
        currency={s.community.currency}
        defaultSort={{ key: "notice_deadline" }}
        exportName="contracts"
        searchPlaceholder="Search contracts or suppliers…"
        empty="No contracts yet. Tap “Add contract” to add the first one."
        views={[
          { label: "Notice due soon", params: { f_notice: "due_soon" } },
          { label: "Auto-renew", params: { f_auto_renew: "Yes" } },
          { label: "Rolling", params: { f_notice: "rolling" } },
          { label: "Ended", params: { f_status: "ended" } },
        ]}
      />
    </>
  );
}
