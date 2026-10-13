import Link from "next/link";
import { Handshake, PieChart, PiggyBank, Receipt, Scale, Wallet } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, moneyShort, todayInput } from "@/lib/format";
import { Badge, Button, Card, Empty, PageHeader, SectionHeader, Stat, TabLinks } from "@/components/ui";
import { BudgetMeter, budgetStatus, needsAttention } from "@/components/finance/BudgetStatus";

export const metadata = { title: "Where the money goes" };

type Spend = { category_name: string; color: string; budget_cents: number; actual_cents: number };
type Contract = { supplier_name: string; service_type: string; title: string; end_date: string | null; annual_cost_cents: number };

/** Whole percent. Never shows 100 % while something is still under its budget, or 0 % once anything is spent. */
function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  const p = Math.round((part / whole) * 100);
  if (part < whole && p >= 100) return 99;
  if (part > 0 && p === 0) return 1;
  return p;
}

export default async function MoneyPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const c = s.community.id;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);
  const thisYear = Number(today.slice(0, 4));
  const year = Number(sp.year) === thisYear - 1 ? thisYear - 1 : thisYear;
  const isCurrent = year === thisYear;

  const [{ data: spendData }, { data: contractData }, owned] = await Promise.all([
    supabase.rpc("community_spend_summary", { c, yr: year }),
    supabase.rpc("community_contracts_public", { c }),
    s.isOwner
      ? supabase.from("unit_ownerships").select("unit:units!inner(coefficient)")
          .eq("community_id", c).eq("owner_id", s.userId).or(`end_date.is.null,end_date.gte.${today}`)
      : Promise.resolve({ data: [] as { unit: unknown }[] }),
  ]);

  const spend = ((spendData ?? []) as Spend[])
    .map((r) => ({ ...r, budget_cents: Number(r.budget_cents), actual_cents: Number(r.actual_cents) }))
    .filter((r) => r.budget_cents > 0 || r.actual_cents > 0)
    .sort((a, b) => b.actual_cents - a.actual_cents);
  const contracts = ((contractData ?? []) as Contract[])
    .map((r) => ({ ...r, annual_cost_cents: Number(r.annual_cost_cents) }))
    .sort((a, b) => b.annual_cost_cents - a.annual_cost_cents);

  const spent = spend.reduce((sum, r) => sum + r.actual_cents, 0);
  const budget = spend.reduce((sum, r) => sum + r.budget_cents, 0);
  const used = pct(spent, budget);
  const contractsTotal = contracts.reduce((sum, r) => sum + r.annual_cost_cents, 0);

  // How far through the year we are, to put "budget used" in context.
  const start = Date.UTC(thisYear, 0, 1);
  const yearGone = isCurrent ? Math.round(((Date.parse(`${today}T00:00:00Z`) - start) / (Date.UTC(thisYear + 1, 0, 1) - start)) * 100) : 100;

  // Owners: their flats' participation share of the community's costs.
  const share = ((owned.data ?? []) as { unit: unknown }[])
    .reduce((sum, o) => sum + Number((o.unit as { coefficient: number } | null)?.coefficient ?? 0), 0);
  const flats = (owned.data ?? []).length;
  const shareText = share.toLocaleString("en-GB", { maximumFractionDigits: 2 });

  const overLines = spend.filter((r) => r.budget_cents > 0 && r.actual_cents > r.budget_cents).length;
  // The same words and colours as the treasurer's Budget page: on track, nearly used, over budget.
  const overall = budgetStatus(budget, spent);

  return (
    <>
      <PageHeader title="Where the money goes" intro="What the community spends, compared with the budget agreed at the AGM." />

      <TabLinks label="Year" tabs={[
        { href: `${base}/money`, label: `This year (${thisYear})`, active: isCurrent },
        { href: `${base}/money?year=${thisYear - 1}`, label: `Last year (${thisYear - 1})`, active: !isCurrent },
      ]} />

      {spend.length === 0 ? (
        <Empty icon={PiggyBank} title={`Nothing recorded for ${year} yet`}
          action={!isCurrent ? <Button variant="secondary" href={`${base}/money`}>See this year</Button> : undefined}>
          Spending appears here once the treasurer records the community&apos;s bills.
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={Receipt} label={isCurrent ? "Spent so far" : `Spent in ${year}`} value={moneyShort(spent, cur)}
              sub={isCurrent ? `1 Jan to ${date(today).replace(/ \d{4}$/, "")}` : "The whole year"} />
            <Stat icon={Wallet} label={`Budget for ${year}`} value={budget > 0 ? moneyShort(budget, cur) : "None"}
              sub={budget > 0 ? "Agreed at the AGM" : "No budget was recorded"} />
            <Stat icon={Scale} label="Budget used" value={budget > 0 ? `${used}%` : "–"} tone={budget > 0 && needsAttention(overall) ? overall.tone : undefined}
              sub={budget <= 0 ? "Nothing to compare with"
                : isCurrent ? `${yearGone}% of the year has passed`
                : spent > budget ? `${moneyShort(spent - budget, cur)} over budget` : `${moneyShort(budget - spent, cur)} under budget`} />
          </div>

          {s.isOwner && share > 0 && budget > 0 && (
            <Card className="border-brand-line">
              <SectionHeader icon={PieChart} title="Your share"
                description={<>Based on your {flats > 1 ? "flats'" : "flat's"} share of the costs ({shareText}%). Your actual fees are under <Link href={`${base}/my-units`} className="font-medium">My flat</Link>.</>} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-2 px-4 py-3.5 ring-1 ring-inset ring-line">
                  <div className="text-sm text-muted">Of the {year} budget</div>
                  <div className="mt-1 text-[1.5rem] font-semibold leading-tight">≈ {money(Math.round((budget * share) / 100 / 12), cur)} <span className="text-[1rem] font-normal text-muted">a month</span></div>
                  <div className="mt-0.5 text-sm text-muted">{money(Math.round((budget * share) / 100), cur)} a year</div>
                </div>
                <div className="rounded-xl bg-surface-2 px-4 py-3.5 ring-1 ring-inset ring-line">
                  <div className="text-sm text-muted">{isCurrent ? "Of what has been spent so far" : `Of what was spent in ${year}`}</div>
                  <div className="mt-1 text-[1.5rem] font-semibold leading-tight">≈ {money(Math.round((spent * share) / 100), cur)}</div>
                  <div className="mt-0.5 text-sm text-muted">{shareText}% of {moneyShort(spent, cur)}</div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <SectionHeader icon={PiggyBank} title="Spending by category"
              description={overLines > 0 ? `${overLines} ${overLines === 1 ? "category is" : "categories are"} over budget.` : budget > 0 ? "Every category is within its budget." : undefined} />
            <ul className="flex flex-col gap-5">
              {spend.map((r) => {
                const status = budgetStatus(r.budget_cents, r.actual_cents);
                const over = status.state === "over";
                return (
                  <li key={r.category_name}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                        <span className="font-medium text-ink">{r.category_name}</span>
                        {needsAttention(status) && <Badge tone={status.tone}>{status.word}</Badge>}
                      </div>
                      <span className="shrink-0 font-medium text-ink tabular">{moneyShort(r.actual_cents, cur)}</span>
                    </div>
                    <BudgetMeter className="mt-2" budget={r.budget_cents} actual={r.actual_cents} />
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm text-muted tabular">
                      {/* Without a budget, the badge already says so. */}
                      <span className={over ? "text-bad" : undefined}>
                        {over ? `${moneyShort(r.actual_cents - r.budget_cents, cur)} over the ${moneyShort(r.budget_cents, cur)} budget`
                          : r.budget_cents > 0 ? `${pct(r.actual_cents, r.budget_cents)}% of ${moneyShort(r.budget_cents, cur)} budget`
                          : null}
                      </span>
                      <span>{pct(r.actual_cents, spent)}% of all spending</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      <Card padded={false} className="mt-5 overflow-hidden">
        <div className="p-5 pb-1 sm:p-6 sm:pb-1">
          <SectionHeader icon={Handshake} title="Who we pay" description="Current contracts with suppliers, largest first." />
        </div>
        {contracts.length === 0 ? (
          <p className="px-5 pb-5 text-[0.9375rem] text-muted sm:px-6 sm:pb-6">There are no current contracts.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {contracts.map((k) => (
                <li key={`${k.supplier_name}-${k.title}`} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{k.supplier_name}</div>
                    <div className="text-[0.9375rem] text-muted">{k.title}</div>
                  </div>
                  <div className="flex shrink-0 items-baseline justify-between gap-4 sm:block sm:text-right">
                    <div className="text-ink tabular"><span className="font-medium">{moneyShort(k.annual_cost_cents, cur)}</span> <span className="text-[0.9375rem] text-muted">a year</span></div>
                    <div className="text-sm text-muted">{k.end_date ? `Until ${date(k.end_date)}` : "Rolling contract"}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3.5 text-[0.9375rem] sm:px-6">
              <span className="text-muted">Yearly amounts are before VAT (IVA).</span>
              <span className="text-ink tabular">Total <span className="font-semibold">{moneyShort(contractsTotal, cur)}</span> a year</span>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
