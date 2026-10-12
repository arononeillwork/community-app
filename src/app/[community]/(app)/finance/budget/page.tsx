import clsx from "clsx";
import { CheckCircle2, CopyPlus, PiggyBank, Pencil, Plus } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput, date, money, todayInput } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice, Stat, StatusBadge, TabLinks, type Tone } from "@/components/ui";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { ConfirmDialog } from "@/components/finance-ops/ConfirmDialog";
import { Flash } from "@/components/finance-ops/Flash";
import { SubmitButton } from "@/components/finance-ops/SubmitButton";
import { daysBetween } from "@/components/finance-ops/dates";
import { approveBudget, createBudget } from "./actions";
import BudgetLinesForm from "./BudgetLinesForm";

export const metadata = { title: "Budget" };

const SAVED: Record<string, string> = {
  created: "Draft budget created. Enter the amount for each category.",
  copied: "Draft budget created from last year's amounts. Adjust them before the AGM.",
  lines: "Budget saved.",
  approved: "Budget marked as approved at the AGM.",
};
const ERRORS: Record<string, string> = {
  exists: "There is already a budget for that year.",
  create: "The budget could not be created. Please try again.",
  copy: "The budget was created, but last year's amounts could not be copied. Enter them below.",
  empty: "Add at least one amount before marking the budget as approved.",
  approve: "The budget could not be approved. Please try again.",
};

type Row = { category_id: string; name: string; color: string; budget: number; actual: number; sort: number };

/** Colour + word for how a category is doing against its budget. */
function verdict(budget: number, actual: number, elapsed: number | null): { tone: Tone; word: string } {
  if (actual > budget) return { tone: "bad", word: "Over budget" };
  if (budget > 0 && actual === budget) return { tone: "warn", word: "Fully used" };
  if (elapsed == null) return actual === 0 ? { tone: "neutral", word: "Not started" } : { tone: "ok", word: "Under budget" };
  const used = budget > 0 ? actual / budget : 0;
  if (used >= 0.9) return { tone: "warn", word: "Nearly used" };
  if (used > elapsed + 0.15) return { tone: "warn", word: "Ahead of plan" };
  return { tone: "ok", word: "On track" };
}

export default async function BudgetPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string; edit?: string; saved?: string; error?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}/finance/budget`;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);
  const thisYear = Number(today.slice(0, 4));

  const { data: budgets } = await supabase.from("budgets").select("id, year, name, status, approved_at").eq("community_id", c).order("year");
  const all = budgets ?? [];
  const asked = Number(sp.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100
    ? asked
    : all.some((b) => b.year === thisYear) ? thisYear : all.at(-1)?.year ?? thisYear;
  const budget = all.find((b) => b.year === year) ?? null;
  const previous = all.find((b) => b.year === year - 1) ?? null;
  const hasNext = all.some((b) => b.year === year + 1);

  const [{ data: categories }, { data: lines }, { data: vsActual }, { data: spend }, prevLinesRes, prevActualRes] = await Promise.all([
    supabase.from("expense_categories").select("id, name, color, sort").eq("community_id", c).order("sort"),
    budget ? supabase.from("budget_lines").select("category_id, amount_cents").eq("budget_id", budget.id) : Promise.resolve({ data: [] }),
    supabase.from("v_budget_vs_actual").select("category_id, budget_cents, actual_cents").eq("community_id", c).eq("year", year),
    supabase.from("v_spend_by_category_month").select("category_name, color, total_cents, month").eq("community_id", c)
      .gte("month", `${year}-01-01`).lte("month", `${year}-12-31`),
    previous ? supabase.from("budget_lines").select("category_id, amount_cents").eq("budget_id", previous.id) : Promise.resolve({ data: [] }),
    supabase.from("v_budget_vs_actual").select("category_id, actual_cents").eq("community_id", c).eq("year", year - 1),
  ]);

  const cats = categories ?? [];
  const actualBy = new Map((vsActual ?? []).map((r) => [r.category_id, Number(r.actual_cents)]));
  const rows: Row[] = (lines ?? []).map((l) => {
    const cat = cats.find((x) => x.id === l.category_id);
    return { category_id: l.category_id, name: cat?.name ?? "Category", color: cat?.color ?? "#64748b", sort: cat?.sort ?? 99,
      budget: Number(l.amount_cents), actual: actualBy.get(l.category_id) ?? 0 };
  }).sort((a, b) => a.sort - b.sort);

  // Spending in categories that have no line in this budget.
  const budgeted = new Set(rows.map((r) => r.name));
  const unbudgetedMap = new Map<string, { color: string; total: number }>();
  for (const r of spend ?? []) {
    if (budgeted.has(r.category_name)) continue;
    const e = unbudgetedMap.get(r.category_name) ?? { color: r.color ?? "#64748b", total: 0 };
    e.total += Number(r.total_cents);
    unbudgetedMap.set(r.category_name, e);
  }
  const unbudgeted = [...unbudgetedMap.entries()].filter(([, v]) => v.total > 0);

  const totalBudget = rows.reduce((t, r) => t + r.budget, 0);
  const totalActual = rows.reduce((t, r) => t + r.actual, 0) + unbudgeted.reduce((t, [, v]) => t + v.total, 0);
  const remaining = totalBudget - totalActual;
  const elapsed = year === thisYear ? daysBetween(`${year}-01-01`, today) / daysBetween(`${year}-01-01`, `${year + 1}-01-01`) : null;
  const isPast = year < thisYear;
  const isFuture = year > thisYear;
  const isDraft = budget?.status === "draft";
  const editing = isDraft && sp.edit === "1";

  const years = Array.from(new Set([...all.map((b) => b.year), thisYear, thisYear + 1, year])).sort((a, b) => a - b);
  const prevLines = new Map((prevLinesRes.data ?? []).map((l) => [l.category_id, Number(l.amount_cents)]));
  const prevActual = new Map((prevActualRes.data ?? []).map((l) => [l.category_id, Number(l.actual_cents)]));

  const startNext = budget && budget.status === "approved" && !hasNext && (
    <form action={createBudget.bind(null, slug)}>
      <input type="hidden" name="year" value={year + 1} />
      <input type="hidden" name="from_year" value={year} />
      <SubmitButton variant="secondary" pendingLabel="Creating…"><CopyPlus aria-hidden className="size-4" /> Start {year + 1} from this budget</SubmitButton>
    </form>
  );

  return (
    <>
      <Toolbar
        title={`Budget ${year}`}
        badge={budget ? <StatusBadge value={budget.status} /> : undefined}
        description={!budget ? undefined
          : budget.status === "approved"
            ? `Approved at the AGM${budget.approved_at ? ` on ${date(budget.approved_at)}` : ""}.`
            : "Draft. Adjust the amounts, then mark it approved after the AGM vote."}
        actions={budget && !editing ? (
          <>
            {isDraft && <Button href={`${base}?year=${year}&edit=1`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit amounts</Button>}
            {startNext}
            {isDraft && (
              <ConfirmDialog
                label="Mark as approved at the AGM"
                icon={<CheckCircle2 aria-hidden className="size-4" />}
                variant="primary"
                confirmVariant="primary"
                title={`Approve the ${year} budget?`}
                description={`Total ${money(totalBudget, cur)}. Once approved, the amounts can no longer be changed.`}
                confirmLabel="Mark as approved"
                pendingLabel="Saving…"
                action={approveBudget.bind(null, slug, budget.id)}
              >
                <div className="field">
                  <label htmlFor="approved_at">Date of the AGM</label>
                  <input id="approved_at" name="approved_at" type="date" className="input" defaultValue={today} required />
                </div>
              </ConfirmDialog>
            )}
          </>
        ) : undefined}
      />

      <TabLinks label="Budget year" tabs={years.map((y) => ({ href: `${base}?year=${y}`, label: String(y), active: y === year }))} />

      <div className="flex flex-col gap-5">
        {((sp.saved && SAVED[sp.saved]) || (sp.error && ERRORS[sp.error])) && (
          <Flash>
            {sp.saved && SAVED[sp.saved] && <Notice tone="ok">{SAVED[sp.saved]}</Notice>}
            {sp.error && ERRORS[sp.error] && <Notice tone="bad">{ERRORS[sp.error]}</Notice>}
          </Flash>
        )}

        {!budget ? (
          <Empty icon={PiggyBank} title={`No budget for ${year} yet`}
            action={
              <form action={createBudget.bind(null, slug)} className="flex flex-wrap justify-center gap-2">
                <input type="hidden" name="year" value={year} />
                {previous && <input type="hidden" name="from_year" value={previous.year} />}
                <SubmitButton pendingLabel="Creating…">
                  {previous ? <><CopyPlus aria-hidden className="size-4" /> Start from the {previous.year} budget</> : <><Plus aria-hidden className="size-4" /> Create a draft budget</>}
                </SubmitButton>
              </form>
            }>
            {previous ? `Copy last year's amounts into a draft and adjust them for the AGM.` : "Create a draft and enter the amount for each category."}
          </Empty>
        ) : editing ? (
          <BudgetLinesForm
            slug={slug}
            budgetId={budget.id}
            year={year}
            cancelHref={`${base}?year=${year}`}
            lines={cats.map((cat) => ({
              category_id: cat.id, name: cat.name, color: cat.color,
              amount: centsToInput((lines ?? []).find((l) => l.category_id === cat.id)?.amount_cents ?? null),
              last_year: prevLines.get(cat.id) ?? null,
              actual_last_year: prevActual.get(cat.id) ?? null,
            }))}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Budget" value={money(totalBudget, cur)} sub={`${rows.length} ${rows.length === 1 ? "category" : "categories"}`} />
              <Stat label={isPast || isFuture ? "Spent" : "Spent so far"} value={money(totalActual, cur)}
                sub={isFuture ? `${year} has not started yet` : totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}% of the budget${elapsed != null ? `, ${Math.round(elapsed * 100)}% of the year gone` : ""}` : undefined} />
              <Stat label={remaining < 0 ? "Over budget" : "Remaining"} value={money(Math.abs(remaining), cur)} tone={remaining < 0 ? "bad" : undefined}
                sub={remaining < 0 ? "More than planned" : isPast ? "Not spent" : isFuture ? `To spend in ${year}` : "Left to spend this year"} />
            </div>

            {rows.length === 0 ? (
              <Empty icon={PiggyBank} title="No amounts yet"
                action={isDraft ? <Button href={`${base}?year=${year}&edit=1`}><Pencil aria-hidden className="size-4" /> Enter amounts</Button> : undefined}>
                Enter how much the community plans to spend per category.
              </Empty>
            ) : (
              <Card padded={false}>
                <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem] gap-4 border-b border-line bg-surface-2 px-6 py-2 text-[0.8125rem] font-medium text-muted md:grid">
                  <span>Category</span><span className="text-right">Budget</span><span className="text-right">Spent</span><span className="text-right">Difference</span>
                </div>
                <ul className="divide-y divide-line">
                  {rows.map((r) => {
                    const v = verdict(r.budget, r.actual, elapsed);
                    const pct = r.budget > 0 ? Math.min(100, (r.actual / r.budget) * 100) : r.actual > 0 ? 100 : 0;
                    const diff = r.budget - r.actual;
                    return (
                      <li key={r.category_id} className="grid gap-x-4 gap-y-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem] md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2.5 font-medium">
                              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />{r.name}
                            </span>
                            <Badge tone={v.tone}>{v.word}</Badge>
                          </div>
                          <div className="relative mt-2 h-2 rounded-full bg-surface-2 ring-1 ring-inset ring-line"
                            role="img" aria-label={`${r.name}: ${Math.round(r.budget > 0 ? (r.actual / r.budget) * 100 : 0)}% of the budget spent`}>
                            <div className={clsx("h-full rounded-full", v.tone === "bad" ? "bg-bad" : v.tone === "warn" ? "bg-warn" : "bg-brand")} style={{ width: `${pct}%` }} />
                            {elapsed != null && (
                              <span aria-hidden title="Today" className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink/50" style={{ left: `${elapsed * 100}%` }} />
                            )}
                          </div>
                        </div>
                        {/* Phone: one line, "€10,285.00 of €12,500.00 · €2,215.00 left" */}
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.9375rem] md:hidden">
                          <span className="tabular text-ink-2">{money(r.actual, cur)} <span className="text-muted">of</span> {money(r.budget, cur)}</span>
                          <span className={clsx("tabular", diff < 0 ? "text-bad" : "text-muted")}>
                            {diff < 0 ? `${money(-diff, cur)} over` : `${money(diff, cur)} left`}
                          </span>
                        </p>
                        <dl className="hidden md:contents">
                          <div className="text-right text-[0.9375rem]">
                            <dt className="sr-only">Budget</dt><dd className="tabular">{money(r.budget, cur)}</dd>
                          </div>
                          <div className="text-right text-[0.9375rem]">
                            <dt className="sr-only">Spent</dt><dd className="tabular">{money(r.actual, cur)}</dd>
                          </div>
                          <div className="text-right text-[0.9375rem]">
                            <dt className="sr-only">Difference</dt>
                            <dd className={clsx("tabular", diff < 0 ? "text-bad" : "text-ink-2")}>
                              {diff < 0 ? `${money(-diff, cur)} over` : `${money(diff, cur)} left`}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                  {unbudgeted.map(([name, v]) => (
                    <li key={name} className="grid gap-x-4 gap-y-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem] md:items-center">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5 font-medium">
                          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: v.color }} />{name}
                        </span>
                        <Badge tone="warn">Not in the budget</Badge>
                      </div>
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.9375rem] md:hidden">
                        <span className="tabular text-ink-2">{money(v.total, cur)} <span className="text-muted">spent</span></span>
                        <span className="tabular text-bad">{money(v.total, cur)} over</span>
                      </p>
                      <div className="hidden text-right text-[0.9375rem] md:block"><span className="sr-only">Budget</span><span className="tabular">{money(0, cur)}</span></div>
                      <div className="hidden text-right text-[0.9375rem] md:block"><span className="sr-only">Spent</span><span className="tabular">{money(v.total, cur)}</span></div>
                      <div className="hidden text-right text-[0.9375rem] md:block"><span className="sr-only">Difference</span><span className="tabular text-bad">{money(v.total, cur)} over</span></div>
                    </li>
                  ))}
                  <li className="grid gap-x-4 gap-y-1 bg-surface-2 px-5 py-3 font-medium sm:px-6 md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem]">
                    <span>Total</span>
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.9375rem] md:hidden">
                      <span className="tabular">{money(totalActual, cur)} <span className="font-normal text-muted">of</span> {money(totalBudget, cur)}</span>
                      <span className={clsx("tabular", remaining < 0 && "text-bad")}>{remaining < 0 ? `${money(-remaining, cur)} over` : `${money(remaining, cur)} left`}</span>
                    </p>
                    <span className="hidden text-right md:block"><span className="sr-only">Budget</span><span className="tabular">{money(totalBudget, cur)}</span></span>
                    <span className="hidden text-right md:block"><span className="sr-only">Spent</span><span className="tabular">{money(totalActual, cur)}</span></span>
                    <span className={clsx("hidden text-right md:block", remaining < 0 && "text-bad")}>
                      <span className="sr-only">Difference</span>
                      <span className="tabular">{remaining < 0 ? `${money(-remaining, cur)} over` : `${money(remaining, cur)} left`}</span>
                    </span>
                  </li>
                </ul>
              </Card>
            )}
            {elapsed != null && rows.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <span aria-hidden className="inline-block h-3.5 w-0.5 rounded-full bg-ink/50" /> The thin line on each bar shows how much of the year has passed.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
