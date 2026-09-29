import Link from "next/link";
import clsx from "clsx";
import { Info, PiggyBank } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { moneyShort, todayInput } from "@/lib/format";
import { Button, Card, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import SpendBars, { type SpendRow } from "./SpendBars";

export const metadata = { title: "Where the money goes" };

type SpendRaw = { category_name: string; color: string | null; budget_cents: number | string | null; actual_cents: number | string | null };
type ContractRaw = { supplier_name: string; service_type: string; title: string; end_date: string | null; annual_cost_cents: number | string | null };

function toRows(data: unknown): SpendRow[] {
  return ((data ?? []) as SpendRaw[]).map((r) => ({
    name: r.category_name,
    budget: Number(r.budget_cents) || 0,
    actual: Number(r.actual_cents) || 0,
  }));
}

const sum = (rows: SpendRow[], k: "budget" | "actual") => rows.reduce((n, r) => n + r[k], 0);

export default async function MoneyPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { community } = await params;
  const { year } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cur = s.community.currency;
  const c = s.community.id;

  const today = todayInput(s.community.timezone);
  const thisYear = Number(today.slice(0, 4));
  const yr = year === String(thisYear - 1) ? thisYear - 1 : thisYear;
  const isThisYear = yr === thisYear;

  const [spendRes, contractsRes] = await Promise.all([
    supabase.rpc("community_spend_summary", { c, yr }),
    supabase.rpc("community_contracts_public", { c }),
  ]);
  const rows = toRows(spendRes.data);
  const shown = rows.filter((r) => r.budget > 0 || r.actual > 0);
  const totalBudget = sum(rows, "budget");
  const totalSpent = sum(rows, "actual");
  const remaining = totalBudget - totalSpent;
  const hasBudget = totalBudget > 0;
  const spentPct = hasBudget ? Math.round((totalSpent / totalBudget) * 100) : null;

  // How far through the year we are, to put "spent so far" in context.
  const start = Date.UTC(thisYear, 0, 1);
  const yearPct = Math.round(((Date.parse(`${today}T00:00:00Z`) - start) / (Date.UTC(thisYear + 1, 0, 1) - start)) * 100);

  // "Your share" for owners: sum of the coefficients of the flats they own, as a share of all flats.
  let share: { pct: number; flats: { label: string; coefficient: number }[]; annual: number | null } | null = null;
  if (s.isOwner) {
    const [ownRes, unitsRes, thisYearRes] = await Promise.all([
      supabase
        .from("unit_ownerships")
        .select("unit:units(id, label, coefficient)")
        .eq("community_id", c)
        .eq("owner_id", s.userId)
        .or(`end_date.is.null,end_date.gte.${today}`),
      supabase.from("units").select("coefficient").eq("community_id", c),
      isThisYear ? Promise.resolve(null) : supabase.rpc("community_spend_summary", { c, yr: thisYear }),
    ]);
    const seen = new Set<string>();
    const flats: { label: string; coefficient: number }[] = [];
    for (const o of (ownRes.data ?? []) as unknown as { unit: { id: string; label: string; coefficient: number | string | null } | null }[]) {
      if (!o.unit || seen.has(o.unit.id)) continue;
      seen.add(o.unit.id);
      flats.push({ label: o.unit.label, coefficient: Number(o.unit.coefficient) || 0 });
    }
    flats.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
    if (flats.length > 0) {
      const mine = flats.reduce((n, f) => n + f.coefficient, 0);
      // Coefficients are percentages that add up to about 100; divide by the real total, as the fee calculation does.
      const all = ((unitsRes.data ?? []) as { coefficient: number | string | null }[]).reduce((n, u) => n + (Number(u.coefficient) || 0), 0);
      const pct = all > 0 ? (mine / all) * 100 : mine;
      const budgetThisYear = isThisYear ? totalBudget : sum(toRows(thisYearRes?.data), "budget");
      share = { pct, flats, annual: budgetThisYear > 0 ? Math.round((budgetThisYear * pct) / 100) : null };
    }
  }

  const contractRows = ((contractsRes.data ?? []) as ContractRaw[]).map((r) => ({
    company: r.supplier_name,
    service: r.service_type,
    contract: r.title,
    end_date: r.end_date,
    annual: Number(r.annual_cost_cents) || 0,
  }));
  const contractColumns: Column[] = [
    { key: "company", header: "Company", primary: true },
    { key: "service", header: "Service", filter: true },
    { key: "contract", header: "Contract" },
    { key: "end_date", header: "Ends", type: "date" },
    { key: "annual", header: "Cost per year", type: "money", total: true },
  ];

  const pctText = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Where the money goes"
        intro="How the community spends the money that owners pay in community fees, and which companies it pays for regular services."
      />

      <nav aria-label="Choose a year" className="no-print flex flex-wrap gap-2">
        {[thisYear, thisYear - 1].map((y) => (
          <Link key={y} href={y === thisYear ? `${base}/money` : `${base}/money?year=${y}`} aria-current={y === yr ? "page" : undefined}
            className={clsx("inline-flex min-h-12 items-center rounded-xl border-2 px-5 font-bold no-underline",
              y === yr ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-bg")}>
            {y === thisYear ? `This year (${y})` : `Last year (${y})`}
          </Link>
        ))}
      </nav>

      <Card className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Info aria-hidden className="size-6" /> How the money works</h2>
        <ul className="flex max-w-3xl list-disc flex-col gap-1 pl-6">
          <li>The <strong>budget</strong> is agreed at the Annual General Meeting (AGM), the yearly meeting of all owners. It sets how much the community plans to spend on each service during the year.</li>
          <li>Owners pay <strong>community fees</strong> to cover the budget. Each flat pays its own fixed share.</li>
          <li><strong>Spent</strong> is the total of the bills (invoices) the community has received from companies in {yr}.</li>
          <li>If something looks wrong, you can ask about it at the next meeting.</li>
        </ul>
      </Card>

      {spendRes.error && <Notice tone="bad">We could not load the spending figures just now. Please try again later.</Notice>}

      {!spendRes.error && (
        <>
          {hasBudget ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label={`Budget for ${yr}`} value={moneyShort(totalBudget, cur)} sub="Agreed by the owners at the AGM" />
              <Stat label={isThisYear ? "Spent so far" : `Spent in ${yr}`} value={moneyShort(totalSpent, cur)} sub={`${spentPct}% of the budget`} />
              {remaining >= 0 ? (
                <Stat label="Remaining" value={moneyShort(remaining, cur)} sub={isThisYear ? "Still available this year" : "Not spent"} />
              ) : (
                <Stat label="Over budget" value={moneyShort(-remaining, cur)} tone="bad" sub="Spent more than planned" />
              )}
            </div>
          ) : (
            <>
              <Notice tone="info">No budget was entered for {yr}, so we can only show what was spent.</Notice>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label={isThisYear ? "Spent so far" : `Spent in ${yr}`} value={moneyShort(totalSpent, cur)} />
              </div>
            </>
          )}

          {share && (
            <Card className="flex flex-col gap-2 !bg-brand-soft">
              <h2 className="flex items-center gap-2 text-xl font-bold"><PiggyBank aria-hidden className="size-6" /> Your share</h2>
              <p className="text-lg">
                {share.flats.length === 1 ? "Your flat pays" : "Your flats pay"} <strong>{pctText(share.pct)}%</strong> of community costs
                {share.annual != null ? (
                  <>, about <strong className="tabular">{moneyShort(share.annual, cur)} per year</strong> or{" "}
                    <strong className="tabular">{moneyShort(Math.round(share.annual / 4), cur)} per quarter</strong>, based on this year&apos;s budget.</>
                ) : (
                  <>. We cannot estimate an amount yet because this year&apos;s budget has not been entered.</>
                )}
              </p>
              <p className="text-muted">
                Each flat has a fixed share of the costs (called its &quot;coefficient&quot;), usually based on its size.{" "}
                {share.flats.map((f) => `Flat ${f.label}: ${pctText(f.coefficient)}%`).join(", ")}.{" "}
                Extra one-off charges (levies) are shared in the same way and come on top.
              </p>
              <div className="mt-1">
                <Button href={`${base}/my-units`} variant="secondary">See my fee statement</Button>
              </div>
            </Card>
          )}

          <section aria-labelledby="bars-h" className="flex flex-col gap-4">
            <h2 id="bars-h" className="text-2xl font-bold">Spending by service in {yr}</h2>
            {isThisYear && hasBudget && (
              <p className="max-w-3xl text-muted">
                We are about {yearPct}% of the way through the year, so having spent around {yearPct}% of a budget is normal.
                Some bills, such as insurance, are paid once a year and can be at 100% early.
              </p>
            )}
            {shown.length === 0 ? (
              <Empty title={`No spending recorded for ${yr} yet.`} />
            ) : (
              <Card>
                <SpendBars rows={shown} currency={cur} hasBudget={hasBudget} />
              </Card>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="contracts-h" className="flex flex-col gap-3">
        <h2 id="contracts-h" className="text-2xl font-bold">Current service contracts</h2>
        <p className="max-w-3xl text-muted">
          The companies the community pays for regular services. Costs are per year, before VAT (sales tax).
          If there is no end date (&quot;—&quot;), the contract continues until it is cancelled.
        </p>
        {contractsRes.error ? (
          <Notice tone="bad">We could not load the contracts just now. Please try again later.</Notice>
        ) : (
          <DataTable
            rows={contractRows}
            columns={contractColumns}
            currency={cur}
            defaultSort={{ key: "company" }}
            exportName="service-contracts"
            searchPlaceholder="Search companies or services…"
            empty="There are no current contracts to show."
          />
        )}
      </section>
    </div>
  );
}
