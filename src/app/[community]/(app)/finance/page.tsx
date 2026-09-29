import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FileWarning } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, moneyShort, todayInput } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import BudgetBars, { type BudgetBarRow } from "@/components/finance/BudgetBars";
import MonthlySpendChart, { type MonthPoint } from "@/components/finance/MonthlySpendChart";
import { approvalThreshold, daysBetween, plural, requiredApprovals } from "@/components/finance/invoice-utils";

export const metadata = { title: "Finance overview" };

type SpendRow = { month: string; category_name: string | null; total_cents: number; invoice_count: number };
type BudgetRow = { category_name: string; budget_cents: number; actual_cents: number };
type OpenInvoice = {
  id: string; invoice_number: string; supplier_name: string | null; total_cents: number; status: string;
  due_date: string | null; issue_date: string; approvals: number | null; overdue: boolean | null; notes: string | null;
};
type ContractDates = {
  id: string; title: string; supplier_name: string | null; end_date: string | null; notice_deadline: string | null;
  days_to_notice: number | null; days_to_end: number | null; auto_renew: boolean;
};
type UnitBalance = { unit_id: string; overdue_cents: number | null };

/** Month keys ("YYYY-MM") for the 12 months ending with the month of `today` (YYYY-MM-DD). */
function last12Months(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const out: { key: string; label: string; short: string; current: boolean }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      short: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      current: i === 0,
    });
  }
  return out;
}

function lastNote(notes: string | null) {
  const parts = (notes ?? "").trim().split(/\n\s*\n/).filter(Boolean);
  const text = parts[parts.length - 1] ?? "";
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export default async function FinanceOverviewPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;
  const currency = s.community.currency;
  const today = todayInput(s.community.timezone);
  const year = Number(today.slice(0, 4));
  const months = last12Months(today);
  const threshold = approvalThreshold(s.community.settings);
  const m = (c: number) => moneyShort(c, currency);

  const [spendRes, budgetRes, budgetMetaRes, openRes, contractRes, balanceRes] = await Promise.all([
    supabase.from("v_spend_by_category_month").select("month, category_name, total_cents, invoice_count")
      .eq("community_id", cid).gte("month", `${months[0].key}-01`),
    supabase.from("v_budget_vs_actual").select("category_name, budget_cents, actual_cents").eq("community_id", cid).eq("year", year),
    supabase.from("budgets").select("name, status").eq("community_id", cid).eq("year", year).maybeSingle(),
    supabase.from("v_invoice_list")
      .select("id, invoice_number, supplier_name, total_cents, status, due_date, issue_date, approvals, overdue, notes")
      .eq("community_id", cid).in("status", ["received", "approved", "disputed"]).order("due_date", { ascending: true }),
    supabase.from("v_contract_key_dates")
      .select("id, title, supplier_name, end_date, notice_deadline, days_to_notice, days_to_end, auto_renew")
      .eq("community_id", cid).eq("status", "active").not("days_to_notice", "is", null).order("days_to_notice"),
    supabase.from("v_unit_balance").select("unit_id, overdue_cents").eq("community_id", cid),
  ]);

  const spend = (spendRes.data ?? []) as SpendRow[];
  const budget = ((budgetRes.data ?? []) as BudgetRow[]).map((b) => ({ ...b, budget_cents: Number(b.budget_cents), actual_cents: Number(b.actual_cents) }));
  const budgetMeta = budgetMetaRes.data as { name: string; status: string } | null;
  const open = (openRes.data ?? []) as OpenInvoice[];
  const contracts = (contractRes.data ?? []) as ContractDates[];
  const balances = (balanceRes.data ?? []) as UnitBalance[];

  // --- Stats -----------------------------------------------------------------
  const yearPrefix = `${year}-`;
  const thisYear = spend.filter((r) => r.month.startsWith(yearPrefix));
  const spentThisYear = thisYear.reduce((t, r) => t + Number(r.total_cents), 0);
  const invoicesThisYear = thisYear.reduce((t, r) => t + Number(r.invoice_count), 0);

  const budgetTotal = budget.reduce((t, b) => t + b.budget_cents, 0);
  const budgetActual = budget.reduce((t, b) => t + b.actual_cents, 0);
  const budgetLeft = budgetTotal - budgetActual;

  const awaiting = open.filter((i) => i.status === "received");
  const awaitingSum = awaiting.reduce((t, i) => t + Number(i.total_cents), 0);
  const overdue = open.filter((i) => i.overdue);
  const overdueSum = overdue.reduce((t, i) => t + Number(i.total_cents), 0);
  const disputed = open.filter((i) => i.status === "disputed");

  const notice90 = contracts.filter((c) => c.days_to_notice != null && c.days_to_notice >= 0 && c.days_to_notice <= 90);
  const noticeSoon = contracts.filter((c) => c.days_to_notice != null && c.days_to_notice <= 60 && (c.days_to_end ?? -1) > 0);

  const feesOverdue = balances.reduce((t, b) => t + Math.max(0, Number(b.overdue_cents ?? 0)), 0);
  const flatsInArrears = balances.filter((b) => Number(b.overdue_cents ?? 0) > 0).length;

  // Which of the waiting invoices has the signed-in person already approved?
  const myApprovals = new Set<string>();
  if (awaiting.length > 0) {
    const { data } = await supabase.from("invoice_approvals").select("invoice_id")
      .eq("approver_id", s.userId).in("invoice_id", awaiting.map((i) => i.id));
    for (const a of (data ?? []) as { invoice_id: string }[]) myApprovals.add(a.invoice_id);
  }

  // --- Budget bars -------------------------------------------------------------
  const budgetNames = new Set(budget.map((b) => b.category_name));
  const unbudgeted = new Map<string, number>();
  for (const r of thisYear) {
    const name = r.category_name ?? "Uncategorised";
    if (!budgetNames.has(name)) unbudgeted.set(name, (unbudgeted.get(name) ?? 0) + Number(r.total_cents));
  }
  const barRows: BudgetBarRow[] = [
    ...budget.slice().sort((a, b) => a.category_name.localeCompare(b.category_name))
      .map((b) => ({ name: b.category_name, budget: b.budget_cents, actual: b.actual_cents })),
    ...Array.from(unbudgeted.entries()).filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, actual]) => ({ name, budget: null, actual })),
  ];
  const startOfYear = `${year}-01-01`;
  const daysInYear = daysBetween(startOfYear, `${year + 1}-01-01`);
  const yearProgressPct = Math.round(((daysBetween(startOfYear, today) + 1) / daysInYear) * 100);

  // --- Monthly spending --------------------------------------------------------
  const byMonth = new Map<string, { total: number; count: number }>();
  for (const r of spend) {
    const k = r.month.slice(0, 7);
    const cur = byMonth.get(k) ?? { total: 0, count: 0 };
    byMonth.set(k, { total: cur.total + Number(r.total_cents), count: cur.count + Number(r.invoice_count) });
  }
  const monthPoints: MonthPoint[] = months.map((mm) => ({ ...mm, total: byMonth.get(mm.key)?.total ?? 0, count: byMonth.get(mm.key)?.count ?? 0 }));

  const nothingToDo = awaiting.length === 0 && noticeSoon.length === 0 && overdue.length === 0 && disputed.length === 0;
  const invoiceLink = (id: string) => `${base}/finance/invoices/${id}`;

  return (
    <>
      <PageHeader
        title="Finance overview"
        intro="Where the community’s money stands today, and what needs doing. Tap any box for the details."
        actions={<Button href={`${base}/finance/invoices/new`} size="lg">+ Add invoice</Button>}
      />
      <FinanceNav slug={s.community.slug} />

      <section aria-labelledby="key-figures" className="mb-8">
        <h2 id="key-figures" className="sr-only">Key figures</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={`Spent in ${year}`} value={m(spentThisYear)} href={`${base}/finance/invoices?range=year`}
            sub={`${plural(invoicesThisYear, "invoice")} so far. Disputed invoices are not counted.`} />
          {budget.length > 0 ? (
            <Stat label="Budget remaining" href={`${base}/finance/budget`}
              value={budgetLeft >= 0 ? m(budgetLeft) : `−${m(-budgetLeft)}`}
              tone={budgetLeft < 0 ? "bad" : budgetLeft < budgetTotal * 0.1 ? "warn" : undefined}
              sub={budgetLeft >= 0
                ? `Left of the ${m(budgetTotal)} planned for ${year}.`
                : `Over budget: ${m(-budgetLeft)} more than the ${m(budgetTotal)} planned for ${year}.`} />
          ) : (
            <Stat label="Budget remaining" value="No budget" href={`${base}/finance/budget`} sub={`No budget has been set up for ${year} yet.`} />
          )}
          <Stat label="Waiting for approval" href={`${base}/finance/invoices?f_status=received`}
            value={awaiting.length} tone={awaiting.length > 0 ? "warn" : undefined}
            sub={awaiting.length > 0 ? `${plural(awaiting.length, "invoice")} worth ${m(awaitingSum)}.` : "Nothing waiting."} />
          <Stat label="Overdue invoices" href={`${base}/finance/invoices?f_state=overdue`}
            value={overdue.length} tone={overdue.length > 0 ? "bad" : "ok"}
            sub={overdue.length > 0 ? `${m(overdueSum)} past the due date and not paid.` : "All invoices are within their due date."} />
          <Stat label="Contract notice deadlines (next 90 days)" href={`${base}/finance/contracts`}
            value={notice90.length} tone={notice90.length > 0 ? "warn" : undefined}
            sub={notice90.length > 0
              ? `Last day to give notice on “${notice90[0].title}”: ${date(notice90[0].notice_deadline)}.`
              : "No notice deadlines in the next 90 days."} />
          <Stat label="Owner fees overdue" href={`${base}/finance/fees`}
            value={m(feesOverdue)} tone={feesOverdue > 0 ? "bad" : "ok"}
            sub={flatsInArrears > 0 ? `${plural(flatsInArrears, "flat")} behind with payments.` : "Every flat is up to date."} />
        </div>
      </section>

      <Card className="mb-8">
        <h2 className="mb-1 text-2xl font-bold">Needs your attention</h2>
        {nothingToDo ? (
          <div className="mt-3"><Notice tone="ok">Nothing needs your attention right now.</Notice></div>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {awaiting.length > 0 && (
              <section aria-labelledby="att-approve">
                <h3 id="att-approve" className="mb-2 flex items-center gap-2 text-xl font-bold">
                  <CheckCircle2 aria-hidden className="size-6 text-warn" /> Waiting for approval ({awaiting.length})
                </h3>
                <ul className="flex flex-col gap-2">
                  {awaiting.map((i) => {
                    const req = requiredApprovals(i.total_cents, threshold);
                    const mine = myApprovals.has(i.id);
                    return (
                      <li key={i.id} className="rounded-xl border border-line bg-bg p-3">
                        <Link href={invoiceLink(i.id)} className="font-bold text-brand underline-offset-4 hover:underline">
                          {i.invoice_number} · {i.supplier_name ?? "Supplier"}
                        </Link>
                        <div className="tabular">{money(i.total_cents, currency)} · {Number(i.approvals ?? 0)} of {req} approvals</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {mine ? <Badge tone="info">You approved. Waiting for another member</Badge> : <Badge tone="warn">Needs your approval</Badge>}
                          {i.overdue && <Badge tone="bad">Overdue</Badge>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {noticeSoon.length > 0 && (
              <section aria-labelledby="att-contracts">
                <h3 id="att-contracts" className="mb-2 flex items-center gap-2 text-xl font-bold">
                  <CalendarClock aria-hidden className="size-6 text-warn" /> Contract notice deadlines ({noticeSoon.length})
                </h3>
                <p className="hint mb-2">The notice deadline is the last day to tell the supplier you want to end or change the contract.</p>
                <ul className="flex flex-col gap-2">
                  {noticeSoon.map((c) => {
                    const d = c.days_to_notice ?? 0;
                    return (
                      <li key={c.id} className="rounded-xl border border-line bg-bg p-3">
                        <Link href={`${base}/finance/contracts/${c.id}`} className="font-bold text-brand underline-offset-4 hover:underline">
                          {c.title}
                        </Link>
                        <span className="text-muted"> · {c.supplier_name ?? "Supplier"}</span>
                        <div>
                          {d < 0 ? (
                            <span className="font-bold text-bad">Notice deadline passed {plural(-d, "day")} ago ({date(c.notice_deadline)}).</span>
                          ) : d === 0 ? (
                            <span className="font-bold text-bad">Today is the last day to give notice.</span>
                          ) : (
                            <>Give notice by <strong>{date(c.notice_deadline)}</strong> (in {plural(d, "day")}).</>
                          )}
                        </div>
                        <div className="text-muted">
                          Contract ends {date(c.end_date)}.{c.auto_renew ? " It renews automatically if nobody gives notice." : ""}
                        </div>
                        <div className="mt-1">
                          {d <= 0 ? <Badge tone="bad">{d < 0 ? "Deadline passed" : "Due today"}</Badge> : <Badge tone={d <= 30 ? "bad" : "warn"}>Due soon</Badge>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {overdue.length > 0 && (
              <section aria-labelledby="att-overdue">
                <h3 id="att-overdue" className="mb-2 flex items-center gap-2 text-xl font-bold">
                  <Clock aria-hidden className="size-6 text-bad" /> Overdue invoices ({overdue.length})
                </h3>
                <ul className="flex flex-col gap-2">
                  {overdue.map((i) => (
                    <li key={i.id} className="rounded-xl border border-line bg-bg p-3">
                      <Link href={invoiceLink(i.id)} className="font-bold text-brand underline-offset-4 hover:underline">
                        {i.invoice_number} · {i.supplier_name ?? "Supplier"}
                      </Link>
                      <div className="tabular">
                        {money(i.total_cents, currency)} · was due {date(i.due_date)}
                        {i.due_date ? ` (${plural(Math.max(1, daysBetween(i.due_date, today)), "day")} ago)` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge tone="bad">Overdue</Badge>
                        <Badge tone={i.status === "approved" ? "info" : "warn"}>{i.status === "approved" ? "Approved, not paid" : "Not approved yet"}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {disputed.length > 0 && (
              <section aria-labelledby="att-disputed">
                <h3 id="att-disputed" className="mb-2 flex items-center gap-2 text-xl font-bold">
                  <FileWarning aria-hidden className="size-6 text-bad" /> Disputed invoices ({disputed.length})
                </h3>
                <p className="hint mb-2">A disputed invoice is one the committee does not agree with. It is not paid or counted until it is sorted out.</p>
                <ul className="flex flex-col gap-2">
                  {disputed.map((i) => (
                    <li key={i.id} className="rounded-xl border border-line bg-bg p-3">
                      <Link href={invoiceLink(i.id)} className="font-bold text-brand underline-offset-4 hover:underline">
                        {i.invoice_number} · {i.supplier_name ?? "Supplier"}
                      </Link>
                      <div className="tabular">{money(i.total_cents, currency)} · issued {date(i.issue_date)}</div>
                      {lastNote(i.notes) && <p className="mt-1 text-muted">“{lastNote(i.notes)}”</p>}
                      <div className="mt-1"><Badge tone="bad">Disputed</Badge></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-2xl font-bold">Budget vs spending in {year}</h2>
          {barRows.length === 0 ? (
            <div className="mt-3">
              <Empty title={`No budget or spending for ${year} yet`}>
                <Link href={`${base}/finance/budget`} className="font-bold text-brand underline">Set up the budget</Link>
              </Empty>
            </div>
          ) : (
            <>
              <p className="mb-2 text-muted">
                The budget is the amount planned for each kind of spending this year. We are {yearProgressPct}% of the way
                through {year}; the thin dark line on each bar marks that point.
              </p>
              {budgetMeta?.status === "draft" && (
                <div className="mb-3">
                  <Notice tone="warn"><AlertTriangle aria-hidden className="mr-1 inline size-5" /> This year’s budget is still a draft. It has not been approved yet.</Notice>
                </div>
              )}
              {budget.length === 0 && (
                <div className="mb-3"><Notice tone="info">No budget has been set for {year}. The bars below show spending only.</Notice></div>
              )}
              <div className="mt-4">
                <BudgetBars rows={barRows} currency={currency} yearProgressPct={yearProgressPct} />
              </div>
              <p className="mt-4">
                <Link href={`${base}/finance/budget`} className="inline-flex min-h-12 items-center font-bold text-brand underline">See the full budget</Link>
              </p>
            </>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-2xl font-bold">Spending by month</h2>
          <p className="mb-2 text-muted">Total of supplier invoices in each of the last 12 months, by invoice date.</p>
          <MonthlySpendChart months={monthPoints} currency={currency} />
        </Card>
      </div>
    </>
  );
}
