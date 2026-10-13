import Link from "next/link";
import {
  ArrowRight, BarChart3, CalendarClock, CheckCircle2, Clock, FileCheck, Home, PiggyBank, Receipt, Scale,
} from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { money, moneyShort, todayInput } from "@/lib/format";
import { Badge, Button, Card, SectionHeader, Stat } from "@/components/ui";
import FinanceHeader from "@/components/finance/FinanceHeader";
import MonthlySpendChart from "@/components/finance/MonthlySpendChart";
import BudgetBars, { type BudgetRow } from "@/components/finance/BudgetBars";
import { requiredApprovals } from "@/components/finance/invoice";
import { isOverdue } from "@/components/finance/dates";

export const metadata = { title: "Finance" };

type OpenInvoice = {
  id: string; invoice_number: string; supplier_name: string; total_cents: number; status: string;
  due_date: string | null; approvals: number; overdue: boolean;
};
type ContractDates = {
  id: string; title: string; supplier_name: string; end_date: string | null; notice_deadline: string | null;
  days_to_end: number | null; days_to_notice: number | null; auto_renew: boolean;
};

const DAY = 86400000;
const LIMIT = 4;

function shortDate(d: string | null) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–";
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY);
}

export default async function FinanceOverview({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance`;
  const cur = s.community.currency;

  const today = todayInput(s.community.timezone);
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, monthIndex - 11 + i, 1));
    return d.toISOString().slice(0, 10);
  });
  const currentMonth = months[11];
  const yearStart = `${year}-01-01`;

  const [{ data: spend }, { data: budget }, { data: open }, { data: mine }, { data: contracts }, { data: arrears }] = await Promise.all([
    supabase.from("v_spend_by_category_month").select("month, total_cents, invoice_count, category_name")
      .eq("community_id", c).gte("month", months[0]),
    supabase.from("v_budget_vs_actual").select("category_id, category_name, budget_cents, actual_cents")
      .eq("community_id", c).eq("year", year),
    supabase.from("v_invoice_list").select("id, invoice_number, supplier_name, total_cents, status, due_date, approvals, overdue")
      .eq("community_id", c).in("status", ["received", "approved"]).order("due_date", { ascending: true, nullsFirst: false }),
    // Only this person's approvals of invoices still waiting (all their approvals ever could pass the row limit).
    supabase.from("invoice_approvals").select("invoice_id, invoice:invoices!inner(status)")
      .eq("community_id", c).eq("approver_id", s.userId).eq("invoice.status", "received"),
    supabase.from("v_contract_key_dates").select("id, title, supplier_name, end_date, notice_deadline, days_to_end, days_to_notice, auto_renew")
      .eq("community_id", c).eq("status", "active"),
    supabase.from("v_unit_balance").select("unit_id, label, overdue_cents").eq("community_id", c).gt("overdue_cents", 0),
  ]);

  // Spending
  const byMonth = new Map(months.map((m) => [m, 0]));
  let spentYear = 0;
  let invoicesYear = 0;
  for (const r of spend ?? []) {
    if (byMonth.has(r.month)) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + Number(r.total_cents));
    if (r.month >= yearStart) { spentYear += Number(r.total_cents); invoicesYear += Number(r.invoice_count); }
  }
  const monthly = months.map((m) => ({ month: m, total: byMonth.get(m) ?? 0 }));
  const last12 = monthly.reduce((sum, m) => sum + m.total, 0);

  // Budget
  const budgetRows: BudgetRow[] = (budget ?? [])
    .map((b) => ({ key: b.category_id, name: b.category_name, budget: Number(b.budget_cents), actual: Number(b.actual_cents) }))
    .sort((a, b) => b.budget - a.budget);
  const budgeted = new Set(budgetRows.map((r) => r.name));
  const unbudgeted = (spend ?? []).filter((r) => r.month >= yearStart && !budgeted.has(r.category_name))
    .reduce((sum, r) => sum + Number(r.total_cents), 0);
  if (budgetRows.length && unbudgeted > 0) budgetRows.push({ key: "other", name: "Other spending", budget: 0, actual: unbudgeted });
  const budgetTotal = budgetRows.reduce((sum, r) => sum + r.budget, 0);
  const remaining = budgetTotal - spentYear;
  const usedPct = budgetTotal > 0 ? Math.round((spentYear / budgetTotal) * 100) : 0;
  const yearShare = (daysBetween(yearStart, today) + 1) / (daysBetween(yearStart, `${year + 1}-01-01`));

  // Invoices
  const threshold = s.community.settings?.invoice_approval_threshold_cents;
  // Overdue by the community's calendar, not the database server's.
  const openInvoices = ((open ?? []) as OpenInvoice[]).map((i) => ({ ...i, overdue: isOverdue(i.status, i.due_date, today) }));
  const approvedByMe = new Set((mine ?? []).map((a) => a.invoice_id));
  const awaiting = openInvoices.filter((i) => i.status === "received");
  const toApprove = awaiting.filter((i) => !approvedByMe.has(i.id));
  const overdue = openInvoices.filter((i) => i.overdue);
  const overdueTotal = overdue.reduce((sum, i) => sum + Number(i.total_cents), 0);
  const overdueOnly = overdue.filter((i) => !toApprove.some((t) => t.id === i.id));

  // Contracts
  const soon = ((contracts ?? []) as ContractDates[]).filter((k) =>
    (k.days_to_notice != null && k.days_to_notice >= 0 && k.days_to_notice <= 90) || (k.days_to_end != null && k.days_to_end >= 0 && k.days_to_end <= 90));
  const noticeSoon = ((contracts ?? []) as ContractDates[])
    .filter((k) => k.days_to_notice != null && k.days_to_notice >= 0 && k.days_to_notice <= 90)
    .sort((a, b) => (a.days_to_notice ?? 0) - (b.days_to_notice ?? 0));
  const nextDeadline = soon
    .map((k) => (k.days_to_notice != null && k.days_to_notice >= 0 ? k.notice_deadline : k.end_date))
    .filter((d): d is string => !!d).sort()[0];

  // Owner fees
  const arrearsTotal = (arrears ?? []).reduce((sum, u) => sum + Number(u.overdue_cents), 0);
  const arrearsFlats = (arrears ?? []).length;

  const attention = toApprove.length + overdueOnly.length + noticeSoon.length;
  const daysLate = (due: string | null) => (due ? daysBetween(due, today) : 0);

  return (
    <>
      <FinanceHeader title="Finance" eyebrow={null} intro={`How the community's money is doing in ${year}.`}
        actions={<Button href={`${base}/invoices/new`}><Receipt aria-hidden className="size-4" /> Add invoice</Button>} />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Spent this year" icon={Receipt} href={`${base}/invoices?view=year`}
            value={moneyShort(spentYear, cur)} sub={`${invoicesYear} ${invoicesYear === 1 ? "invoice" : "invoices"} since 1 January`} />
          <Stat label="Budget remaining" icon={PiggyBank} href={`${base}/budget`}
            value={budgetTotal > 0 ? moneyShort(remaining, cur) : "No budget"}
            tone={budgetTotal > 0 && remaining < 0 ? "bad" : undefined}
            sub={budgetTotal > 0 ? `${usedPct}% of ${moneyShort(budgetTotal, cur)} used` : `Set the ${year} budget`} />
          <Stat label="Awaiting approval" icon={FileCheck} href={`${base}/invoices?view=received`}
            value={awaiting.length} tone={toApprove.length > 0 ? "warn" : undefined}
            sub={toApprove.length > 0 ? `${toApprove.length} need${toApprove.length === 1 ? "s" : ""} your approval` : "None waiting for you"} />
          <Stat label="Overdue invoices" icon={Clock} href={`${base}/invoices?view=overdue`}
            value={overdue.length} tone={overdue.length > 0 ? "bad" : "ok"}
            sub={overdue.length > 0 ? `${money(overdueTotal, cur)} past the due date` : "Everything is on time"} />
          <Stat label="Contracts due in 90 days" icon={CalendarClock} href={`${base}/contracts`}
            value={soon.length} tone={soon.length > 0 ? "warn" : undefined}
            sub={nextDeadline ? `Ending or notice due · next ${shortDate(nextDeadline)}` : "No ends or notice deadlines"} />
          <Stat label="Owner fees in arrears" icon={Home} href={`${base}/fees`}
            value={moneyShort(arrearsTotal, cur)} tone={arrearsTotal > 0 ? "bad" : "ok"}
            sub={arrearsFlats > 0 ? `${arrearsFlats} ${arrearsFlats === 1 ? "flat is" : "flats are"} behind` : "All flats are up to date"} />
        </div>

        {/* Phones: what needs doing comes first. Wide screens: budget and monthly spending on the left, the to-do list on the right. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
            <Card>
              <SectionHeader icon={Scale} title="Budget against spending" description={budgetRows.length ? `${year} budget, by category` : undefined}
                action={<Button href={`${base}/budget`} variant="ghost" size="sm">Budget</Button>} />
              {budgetRows.length ? (
                <BudgetBars rows={budgetRows} yearShare={Math.min(1, yearShare)} currency={cur} />
              ) : (
                <div className="rounded-xl bg-surface-2 px-4 py-6 text-center">
                  <p className="text-[0.9375rem] text-muted">There is no budget for {year} yet. Add one to compare spending by category.</p>
                  <div className="mt-3"><Button href={`${base}/budget`} variant="secondary" size="sm">Set up the budget</Button></div>
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader icon={BarChart3} title="Spending by month"
                description={<>Last 12 months · <span className="tabular text-ink-2">{money(last12, cur)}</span> in total</>}
                action={<Button href={`${base}/invoices`} variant="ghost" size="sm">Invoices</Button>} />
              {last12 > 0 ? (
                <MonthlySpendChart months={monthly} currency={cur} currentMonth={currentMonth} />
              ) : (
                <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-[0.9375rem] text-muted">
                  No invoices in the last 12 months. Add invoices to see spending month by month.
                </p>
              )}
            </Card>
          </div>

          <Card className="order-first lg:order-none lg:col-span-2" padded={false}>
            <div className="p-5 pb-2 sm:p-6 sm:pb-2">
              <SectionHeader icon={CheckCircle2} title="Needs your attention"
                description={attention ? `${attention} ${attention === 1 ? "item" : "items"}` : undefined} className="!mb-0" />
            </div>
            {attention === 0 ? (
              <div className="px-5 pb-6 sm:px-6">
                <p className="rounded-xl bg-ok-soft px-4 py-3 text-[0.9375rem] text-ok">Nothing needs you right now. Invoices are approved and contracts are on track.</p>
              </div>
            ) : (
              <div className="pb-2">
                {toApprove.length > 0 && (
                  <AttentionGroup title="To approve" more={toApprove.length - LIMIT} moreHref={`${base}/invoices?view=received`}>
                    {toApprove.slice(0, LIMIT).map((i) => {
                      const need = requiredApprovals(Number(i.total_cents), threshold);
                      return (
                        <AttentionItem key={i.id} href={`${base}/invoices/${i.id}`}
                          title={i.supplier_name} meta={`${i.invoice_number} · ${i.approvals} of ${need} ${need === 1 ? "approval" : "approvals"}`}
                          value={money(i.total_cents, cur)} badge={i.overdue ? <Badge tone="bad">Overdue</Badge> : null} />
                      );
                    })}
                  </AttentionGroup>
                )}
                {overdueOnly.length > 0 && (
                  <AttentionGroup title="Overdue" more={overdueOnly.length - LIMIT} moreHref={`${base}/invoices?view=overdue`}>
                    {overdueOnly.slice(0, LIMIT).map((i) => {
                      const late = daysLate(i.due_date);
                      return (
                        <AttentionItem key={i.id} href={`${base}/invoices/${i.id}`}
                          title={i.supplier_name} meta={`${i.invoice_number} · ${late} ${late === 1 ? "day" : "days"} late`}
                          value={money(i.total_cents, cur)} />
                      );
                    })}
                  </AttentionGroup>
                )}
                {noticeSoon.length > 0 && (
                  <AttentionGroup title="Notice deadlines" more={noticeSoon.length - LIMIT} moreHref={`${base}/contracts`}>
                    {noticeSoon.slice(0, LIMIT).map((k) => (
                      <AttentionItem key={k.id} href={`${base}/contracts/${k.id}`}
                        title={k.title} meta={`Give notice by ${shortDate(k.notice_deadline)}`}
                        badge={<Badge tone={(k.days_to_notice ?? 0) <= 30 ? "warn" : "neutral"}>
                          {k.days_to_notice === 0 ? "Today" : `${k.days_to_notice} ${k.days_to_notice === 1 ? "day" : "days"}`}
                        </Badge>} />
                    ))}
                  </AttentionGroup>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AttentionGroup({ title, children, more, moreHref }: { title: string; children: React.ReactNode; more: number; moreHref: string }) {
  return (
    <section className="mt-2">
      <h3 className="px-5 pb-1 text-sm font-medium text-muted sm:px-6">{title}</h3>
      <ul className="divide-y divide-line">{children}</ul>
      {more > 0 && (
        <Link href={moreHref} className="mx-5 mb-1 mt-0.5 inline-flex min-h-9 items-center gap-1 text-sm font-medium no-underline hover:underline sm:mx-6">
          {more} more <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

function AttentionItem({ href, title, meta, value, badge }: {
  href: string; title: string; meta: string; value?: string; badge?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-2.5 text-ink no-underline transition-colors hover:bg-surface-2 sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:underline">{title}</span>
          <span className="block truncate text-sm text-muted">{meta}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {value && <span className="text-[0.9375rem] tabular text-ink-2">{value}</span>}
          {badge}
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
