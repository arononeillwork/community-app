import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput, todayInput } from "@/lib/format";
import { Button, Empty, PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import BudgetForm, { type BudgetCategory } from "@/components/finance/register/BudgetForm";
import { saveBudget } from "../actions";

export const metadata = { title: "Edit budget" };

type BudgetRow = { id: string; year: number; name: string; status: string; approved_at: string | null };

export default async function EditBudgetPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;
  const asked = Number(sp.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(todayInput(s.community.timezone).slice(0, 4));

  const { data: budgetData } = await supabase.from("budgets").select("id, year, name, status, approved_at")
    .eq("community_id", cid).eq("year", year).maybeSingle();
  const budget = budgetData as BudgetRow | null;

  if (!budget) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Edit budget ${year}`} back={{ href: `${base}/finance/budget?year=${year}`, label: "Budget" }} />
        <FinanceNav slug={s.community.slug} />
        <Empty title={`There is no budget for ${year} yet.`}>
          <p className="mb-4">Go back to the budget page to start one.</p>
          <Button href={`${base}/finance/budget?year=${year}`} size="lg">Go to the budget page</Button>
        </Empty>
      </div>
    );
  }

  const [{ data: cats }, { data: lines }, { data: last }] = await Promise.all([
    supabase.from("expense_categories").select("id, name, color").eq("community_id", cid).order("sort").order("name"),
    supabase.from("budget_lines").select("category_id, amount_cents").eq("budget_id", budget.id),
    // Last year's budget and spending per category, shown as a guide.
    supabase.rpc("community_spend_summary", { c: cid, yr: year - 1 }),
  ]);
  const amountBy = new Map(((lines ?? []) as { category_id: string; amount_cents: number }[]).map((l) => [l.category_id, Number(l.amount_cents)]));
  const lastBy = new Map(((last ?? []) as { category_name: string; budget_cents: number; actual_cents: number }[])
    .map((r) => [r.category_name, r]));

  const categories: BudgetCategory[] = ((cats ?? []) as { id: string; name: string; color: string }[]).map((c) => {
    const prev = lastBy.get(c.name);
    const amount = amountBy.get(c.id);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      amount: amount == null ? "" : centsToInput(amount),
      lastBudgetCents: prev && Number(prev.budget_cents) > 0 ? Number(prev.budget_cents) : null,
      lastSpentCents: prev && Number(prev.actual_cents) > 0 ? Number(prev.actual_cents) : null,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit budget ${year}`} back={{ href: `${base}/finance/budget?year=${year}`, label: "Budget" }}
        intro="Type the planned amount for each type of cost. The total updates as you type." />
      <FinanceNav slug={s.community.slug} />
      {categories.length === 0 ? (
        <Empty title="There are no types of cost yet">
          Types of cost (for example Gardening or Cleaning) are set up by the administrator. Once they exist you can budget for them here.
        </Empty>
      ) : (
        <BudgetForm
          action={saveBudget.bind(null, s.community.slug, budget.id)}
          year={budget.year}
          name={budget.name}
          status={budget.status}
          approvedAt={budget.approved_at ?? ""}
          categories={categories}
          currency={s.community.currency}
          cancelHref={`${base}/finance/budget?year=${year}`}
        />
      )}
    </div>
  );
}
