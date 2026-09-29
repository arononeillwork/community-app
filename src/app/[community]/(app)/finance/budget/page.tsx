import { Pencil } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Button, Card, Empty, Notice, PageHeader, Stat, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import ActionButton from "@/components/finance/register/ActionButton";
import { budgetStatus } from "@/components/finance/register/dates";
import { createBudget, startNextYearBudget } from "./actions";

export const metadata = { title: "Budget" };

type BudgetRow = { id: string; year: number; name: string; status: string; approved_at: string | null };
type LineRow = { category_id: string; category_name: string; color: string; budget_cents: number; actual_cents: number };

export default async function BudgetPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string; saved?: string; started?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cur = s.community.currency;
  const cid = s.community.id;

  const thisYear = Number(todayInput(s.community.timezone).slice(0, 4));
  const asked = Number(sp.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear;

  const [{ data: budgetData }, { data: lineData }, { data: spendData }] = await Promise.all([
    supabase.from("budgets").select("id, year, name, status, approved_at").eq("community_id", cid).order("year", { ascending: false }),
    supabase.from("v_budget_vs_actual").select("category_id, category_name, color, budget_cents, actual_cents").eq("community_id", cid).eq("year", year),
    supabase.from("v_spend_by_category_month").select("total_cents").eq("community_id", cid)
      .gte("month", `${year}-01-01`).lte("month", `${year}-12-31`),
  ]);
  const budgets = (budgetData ?? []) as BudgetRow[];
  const budget = budgets.find((b) => b.year === year) ?? null;
  const hasNext = budgets.some((b) => b.year === year + 1);
  const hasPrev = budgets.some((b) => b.year === year - 1);
  const years = Array.from(new Set([...budgets.map((b) => b.year), thisYear, year])).sort((a, b) => b - a);

  const rows = ((lineData ?? []) as LineRow[]).map((l) => {
    const budgetCents = Number(l.budget_cents ?? 0);
    const spent = Number(l.actual_cents ?? 0);
    return {
      id: l.category_id,
      category: l.category_name,
      budget_cents: budgetCents,
      actual_cents: spent,
      remaining_cents: budgetCents - spent,
      pct_used: budgetCents > 0 ? Math.round((spent / budgetCents) * 1000) / 10 : undefined,
      status: budgetStatus(budgetCents, spent),
    };
  });
  const totalBudget = rows.reduce((sum, r) => sum + r.budget_cents, 0);
  const totalSpent = rows.reduce((sum, r) => sum + r.actual_cents, 0);
  const remaining = totalBudget - totalSpent;
  const overCount = rows.filter((r) => r.status === "over").length;
  const nearCount = rows.filter((r) => r.status === "near_limit").length;
  const allSpend = ((spendData ?? []) as { total_cents: number }[]).reduce((sum, r) => sum + Number(r.total_cents ?? 0), 0);
  const outside = Math.max(0, allSpend - totalSpent);

  const columns: Column[] = [
    { key: "category", header: "Type of cost", primary: true },
    { key: "budget_cents", header: "Budget", type: "money", total: true },
    { key: "actual_cents", header: "Spent", type: "money", total: true },
    { key: "remaining_cents", header: "Left to spend", type: "money", total: true },
    { key: "pct_used", header: "% used", type: "percent" },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  const yearPicker = (
    <form method="get" className="no-print flex flex-wrap items-end gap-2">
      <div className="field">
        <label htmlFor="year">Year</label>
        <select id="year" name="year" className="input w-auto min-w-32" defaultValue={String(year)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button type="submit" className="min-h-12 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold hover:bg-bg">Show</button>
    </form>
  );

  return (
    <>
      <PageHeader
        title={`Budget ${year}`}
        intro="The budget is how much the community agreed to spend on each type of cost in a year. Here you can see how much has been spent so far."
        actions={budget ? <Button href={`${base}/finance/budget/edit?year=${year}`} size="lg"><Pencil aria-hidden className="size-5" /> Edit budget</Button> : undefined}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="mb-6 flex flex-col gap-4">
        {sp.saved && <Notice tone="ok">The budget has been saved.</Notice>}
        {sp.started && <Notice tone="ok">The {year} budget has been started as a draft, with the amounts copied from {year - 1}. Check each line and change what you need.</Notice>}
        {yearPicker}
      </div>

      {!budget ? (
        <Empty title={`There is no budget for ${year} yet.`}>
          <p className="mb-4">You can start one now and fill in the amounts afterwards.</p>
          <div className="mx-auto flex max-w-md flex-col gap-3">
            {hasPrev && (
              <ActionButton action={startNextYearBudget.bind(null, s.community.slug, year - 1)} variant="primary" size="lg" pendingLabel="Creating…">
                Start {year} from the {year - 1} amounts
              </ActionButton>
            )}
            <ActionButton action={createBudget.bind(null, s.community.slug, year)} variant={hasPrev ? "secondary" : "primary"} size="lg" pendingLabel="Creating…">
              Start an empty {year} budget
            </ActionButton>
          </div>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">{budget.name}</h2>
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge value={budget.status} />
                {budget.status === "approved"
                  ? <span>Approved on {date(budget.approved_at)}</span>
                  : <span className="text-muted">Draft: the numbers are still being worked on and have not been approved by the owners yet.</span>}
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total budget" value={money(totalBudget, cur)} />
            <Stat label="Spent so far" value={money(totalSpent, cur)} sub={totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)} % of the budget` : undefined} />
            <Stat label={remaining >= 0 ? "Left to spend" : "Over budget by"} value={money(Math.abs(remaining), cur)} tone={remaining < 0 ? "bad" : "ok"} />
            <Stat label="Lines over budget" value={overCount} tone={overCount ? "bad" : "ok"}
              sub={nearCount ? `${nearCount} close to the limit` : "None close to the limit"} />
          </div>

          <Card className="!bg-info-soft">
            <h2 className="mb-2 text-xl font-bold">How to read this</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li><strong>Spent</strong> adds up the invoices dated in {year} for each type of cost, including VAT. Disputed invoices are not counted.</li>
              <li><strong>Left to spend</strong> is the budget minus what has been spent. A minus number means it is over budget.</li>
              <li><strong>Status</strong>: <em>On track</em> means less than 90 % used, <em>Near limit</em> means 90 to 100 % used, <em>Over</em> means more than the budget has been spent.</li>
            </ul>
          </Card>

          {outside > 0 && (
            <Notice tone="info">
              {money(outside, cur)} of invoices in {year} are in a type of cost that has no budget line (or no type at all), so they are not in the table below.
            </Notice>
          )}

          <DataTable
            rows={rows}
            columns={columns}
            currency={cur}
            defaultSort={{ key: "pct_used", desc: true }}
            exportName={`budget-${year}`}
            searchPlaceholder="Search types of cost…"
            empty="This budget has no lines yet. Tap “Edit budget” to add the amounts."
            views={[
              { label: "Over budget", params: { f_status: "over" } },
              { label: "Near the limit", params: { f_status: "near_limit" } },
              { label: "On track", params: { f_status: "on_track" } },
            ]}
          />

          {!hasNext && (
            <Card className="no-print">
              <h2 className="mb-2 text-xl font-bold">Next year</h2>
              <p className="mb-3">
                Start the {year + 1} budget as a draft. It copies the {year} amounts so you only need to change what is different.
                Nothing is approved until you say so.
              </p>
              <ActionButton action={startNextYearBudget.bind(null, s.community.slug, year)} pendingLabel="Creating…">
                Start next year&apos;s budget ({year + 1})
              </ActionButton>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
