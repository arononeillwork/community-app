import { FileUp, Settings2 } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { money, moneyShort, todayInput } from "@/lib/format";
import { Button, Card, Notice, PageHeader, Stat } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import { fetchAll, ownersByUnit } from "@/components/finance/fees/data";
import { addDays, dateInZone, daysBetween, frequencyInfo, num, plural } from "@/components/finance/fees/utils";

export const metadata = { title: "Owner fees" };

type Balance = {
  unit_id: string; label: string; building_name: string | null; coefficient: number | string | null;
  charged_cents: number; paid_cents: number; overdue_cents: number; oldest_unpaid_due: string | null;
  owner_names: string | null; last_reminder_at: string | null;
};
type OpenCharge = { unit_id: string; due_date: string; amount_cents: number; paid_cents: number };
type Schedule = { year: number; frequency: string; method: string; annual_total_cents: number | null; fixed_amount_cents: number | null };

export default async function OwnerFeesPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;
  const currency = s.community.currency;
  const tz = s.community.timezone;
  const today = todayInput(tz);
  const year = Number(today.slice(0, 4));
  const soon = addDays(today, 30);

  const [balancesRes, yearRes, openRes, creditRes, scheduleRes] = await Promise.all([
    fetchAll<Balance>((from, to) => supabase.from("v_unit_balance")
      .select("unit_id, label, building_name, coefficient, charged_cents, paid_cents, overdue_cents, oldest_unpaid_due, owner_names, last_reminder_at")
      .eq("community_id", cid).order("label").range(from, to)),
    fetchAll<{ amount_cents: number; paid_cents: number }>((from, to) => supabase.from("fee_charges")
      .select("id, amount_cents, paid_cents").eq("community_id", cid)
      .gte("due_date", `${year}-01-01`).lte("due_date", `${year}-12-31`).order("id").range(from, to)),
    fetchAll<OpenCharge>((from, to) => supabase.from("fee_charges")
      .select("id, unit_id, due_date, amount_cents, paid_cents").eq("community_id", cid).neq("status", "paid")
      .order("id").range(from, to)),
    fetchAll<{ unit_id: string; unallocated_cents: number }>((from, to) => supabase.from("fee_payments")
      .select("id, unit_id, unallocated_cents").eq("community_id", cid).gt("unallocated_cents", 0).order("id").range(from, to)),
    supabase.from("fee_schedules").select("year, frequency, method, annual_total_cents, fixed_amount_cents")
      .eq("community_id", cid).eq("year", year).maybeSingle(),
  ]);
  const loadFailed = !!(balancesRes.error || yearRes.error || openRes.error || creditRes.error);
  const balances = balancesRes.rows;
  const schedule = scheduleRes.data as Schedule | null;
  const owners = await ownersByUnit(supabase, cid, today, new Map(balances.map((b) => [b.unit_id, b.owner_names])));

  // Totals for the tiles
  const chargedYear = yearRes.rows.reduce((t, c) => t + num(c.amount_cents), 0);
  const collectedYear = yearRes.rows.reduce((t, c) => t + num(c.paid_cents), 0);
  const overdueTotal = balances.reduce((t, b) => t + num(b.overdue_cents), 0);
  const inArrears = balances.filter((b) => num(b.overdue_cents) > 0);

  const credit = new Map<string, number>();
  for (const p of creditRes.rows) credit.set(p.unit_id, (credit.get(p.unit_id) ?? 0) + num(p.unallocated_cents));
  const dueSoon = new Set(openRes.rows.filter((c) => c.due_date > today && c.due_date <= soon && num(c.amount_cents) > num(c.paid_cents)).map((c) => c.unit_id));
  const ownerText = (unitId: string) => (owners.get(unitId) ?? []).join(", ") || "No owner on file";

  const arrearsRows = inArrears.map((b) => ({
    unit_id: b.unit_id,
    label: b.label,
    building: b.building_name ?? "No block",
    owners: ownerText(b.unit_id),
    overdue_cents: num(b.overdue_cents),
    oldest_unpaid_due: b.oldest_unpaid_due,
    days_overdue: b.oldest_unpaid_due ? Math.max(0, daysBetween(b.oldest_unpaid_due, today)) : null,
    last_reminder: dateInZone(b.last_reminder_at, tz),
  }));

  const flatRows = balances.map((b) => {
    const charged = num(b.charged_cents);
    const paid = num(b.paid_cents);
    const cr = credit.get(b.unit_id) ?? 0;
    const balance = charged - paid - cr;
    const status = num(b.overdue_cents) > 0 ? "overdue" : dueSoon.has(b.unit_id) ? "due_soon" : charged - paid > 0 ? "not_due_yet" : "paid";
    return {
      unit_id: b.unit_id, label: b.label, building: b.building_name ?? "No block", owners: ownerText(b.unit_id),
      coefficient: num(b.coefficient), charged_cents: charged, paid_cents: paid, credit_cents: cr, balance_cents: balance, status,
    };
  });
  const anyCredit = flatRows.some((r) => r.credit_cents > 0);

  const arrearsColumns: Column[] = [
    { key: "label", header: "Flat", href: `${base}/finance/fees/units/{unit_id}`, primary: true },
    { key: "building", header: "Block", filter: true },
    { key: "owners", header: "Owner(s)" },
    { key: "overdue_cents", header: "Overdue", type: "money", total: true },
    { key: "oldest_unpaid_due", header: "Oldest unpaid fee was due", type: "date" },
    { key: "days_overdue", header: "Days overdue", type: "number" },
    { key: "last_reminder", header: "Last reminder", type: "date" },
  ];

  const flatColumns: Column[] = [
    { key: "label", header: "Flat", href: `${base}/finance/fees/units/{unit_id}`, primary: true },
    { key: "building", header: "Block", filter: true },
    { key: "owners", header: "Owner(s)" },
    { key: "coefficient", header: "Share", type: "percent", mobileHidden: true },
    { key: "charged_cents", header: "Charged", type: "money", total: true },
    { key: "paid_cents", header: "Paid", type: "money", total: true },
    ...(anyCredit ? [{ key: "credit_cents", header: "Credit", type: "money", total: true } as Column] : []),
    { key: "balance_cents", header: "Balance", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  // Worked example for the explanation: the most common share among the flats.
  const coefCounts = new Map<number, number>();
  for (const b of balances) coefCounts.set(num(b.coefficient), (coefCounts.get(num(b.coefficient)) ?? 0) + 1);
  const sampleCoef = Array.from(coefCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const totalCoef = balances.reduce((t, b) => t + num(b.coefficient), 0);
  const freq = frequencyInfo(schedule?.frequency);
  const sampleYear = schedule?.method === "coefficient" && totalCoef > 0 && sampleCoef > 0
    ? Math.round((num(schedule.annual_total_cents) * sampleCoef) / totalCoef) : null;
  const m = (c: number) => money(c, currency);

  return (
    <>
      <PageHeader
        title="Owner fees"
        intro="Community fees that flat owners pay. Owners pay by bank; the committee records the payments here."
        actions={
          <>
            <Button href={`${base}/finance/fees/schedule`} variant="secondary"><Settings2 aria-hidden className="size-5" /> Fee schedule &amp; levies</Button>
            <Button href={`${base}/finance/fees/import`}><FileUp aria-hidden className="size-5" /> Import bank statement</Button>
          </>
        }
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-8">
        {loadFailed && <Notice tone="bad">Some fee figures could not be loaded. Please refresh the page.</Notice>}

        <section aria-labelledby="totals-heading">
          <h2 id="totals-heading" className="sr-only">Totals</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`Charged in ${year}`} value={moneyShort(chargedYear, currency)} sub="Regular fees and levies due this year" />
            <Stat label="Collected" value={moneyShort(collectedYear, currency)} tone="ok"
              sub={chargedYear > 0 ? `${Math.round((collectedYear / chargedYear) * 100)}% of this year's charges (some are not due yet)` : "Nothing charged yet this year"} />
            <Stat label="Outstanding (overdue)" value={moneyShort(overdueTotal, currency)} tone={overdueTotal > 0 ? "bad" : "ok"}
              sub="Past the due date and not yet paid" />
            <Stat label="Flats in arrears" value={inArrears.length} tone={inArrears.length > 0 ? "bad" : "ok"}
              sub={`of ${plural(balances.length, "flat")} (“in arrears” means behind with payments)`} />
          </div>
        </section>

        <section aria-labelledby="arrears-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="arrears-heading" className="text-2xl font-bold">In arrears</h2>
            <p className="text-muted">Flats with fees that are past their due date and not fully paid. Open a flat to record a payment or log a reminder.</p>
          </div>
          <DataTable
            id="arrears-"
            rows={arrearsRows}
            columns={arrearsColumns}
            currency={currency}
            defaultSort={{ key: "days_overdue", desc: true }}
            exportName="fees-in-arrears"
            searchPlaceholder="Search flat or owner…"
            empty="Good news: no flat is behind with its fees."
          />
        </section>

        <section aria-labelledby="flats-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="flats-heading" className="text-2xl font-bold">All flats</h2>
            <p className="text-muted">
              <strong>Balance</strong> is what the flat still has to pay, including fees that are not due yet.
              A minus amount means the owner has paid more than was charged (credit).
            </p>
          </div>
          <DataTable
            id="flats-"
            rows={flatRows}
            columns={flatColumns}
            currency={currency}
            defaultSort={{ key: "label" }}
            exportName="fees-all-flats"
            searchPlaceholder="Search flat or owner…"
            empty="There are no flats in this community yet."
            views={[
              { label: "Overdue", params: { f_status: "overdue" } },
              { label: "Due soon", params: { f_status: "due_soon" } },
              { label: "Fully paid", params: { f_status: "paid" } },
            ]}
          />
        </section>

        <Card className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">How the fees are worked out</h2>
          <p>
            Every flat has a <strong>share</strong> of the community, also called its <strong>coefficient</strong> (in Spain:
            “cuota de participación”). It is written in the property deeds, and the shares of all flats add up to 100%.
            Bigger flats usually have a bigger share, so they pay more.
          </p>
          {schedule?.method === "coefficient" ? (
            <p>
              In {year} the community needs {m(num(schedule.annual_total_cents))} for the year. Each flat pays its share of that amount.
              {sampleYear != null && (
                <> For example, a flat with a {sampleCoef.toFixed(2)}% share pays {m(sampleYear)} a year
                  {freq.periods > 1 && <>, which is {m(Math.round(sampleYear / freq.periods))} per {freq.per}</>}.</>
              )}
            </p>
          ) : schedule?.method === "fixed" ? (
            <p>In {year} every flat pays the same fixed amount: {m(num(schedule.fixed_amount_cents))} per {freq.per}.</p>
          ) : (
            <p>No fee schedule has been set up for {year} yet. Go to <strong>Fee schedule &amp; levies</strong> to set one up.</p>
          )}
          <p>
            An <strong>extraordinary levy</strong> is a one-off extra charge, for example for a roof repair. It is split between
            the flats by the same shares.
          </p>
          <p>
            When a payment is recorded, it pays off the <strong>oldest unpaid fee first</strong>. If an owner pays more than
            they owe, the extra is kept as <strong>credit</strong> on their flat.
          </p>
        </Card>
      </div>
    </>
  );
}
