import Link from "next/link";
import clsx from "clsx";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { money, todayInput } from "@/lib/format";
import { Card, Notice, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import ActionForm from "@/components/finance/fees/ActionForm";
import { fetchAll } from "@/components/finance/fees/data";
import { addDays, frequencyInfo, num, plural } from "@/components/finance/fees/utils";
import { allocateLevy, generateCharges } from "../actions";
import LevyForm from "./LevyForm";
import ScheduleForm from "./ScheduleForm";

export const metadata = { title: "Fee schedule & levies" };

type Schedule = {
  id: string; year: number; frequency: string; method: string; annual_total_cents: number | null;
  fixed_amount_cents: number | null; budget_id: string | null; active: boolean;
};
type Levy = { id: string; title: string; description: string | null; total_cents: number; due_date: string };
type ChargeLite = { schedule_id: string | null; levy_id: string | null; period_label: string; due_date: string; amount_cents: number; paid_cents: number };

export default async function FeeSchedulePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string; created?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;
  const currency = s.community.currency;
  const today = todayInput(s.community.timezone);
  const currentYear = Number(today.slice(0, 4));
  const asked = Number(sp.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : currentYear;
  const m = (c: number) => money(c, currency);

  const [schedulesRes, unitsRes, budgetsRes, linesRes, leviesRes] = await Promise.all([
    supabase.from("fee_schedules").select("id, year, frequency, method, annual_total_cents, fixed_amount_cents, budget_id, active")
      .eq("community_id", cid).order("year"),
    fetchAll<{ id: string; coefficient: number | string | null }>((from, to) =>
      supabase.from("units").select("id, coefficient").eq("community_id", cid).order("id").range(from, to)),
    supabase.from("budgets").select("id, year, name, status").eq("community_id", cid),
    fetchAll<{ budget_id: string; amount_cents: number }>((from, to) =>
      supabase.from("budget_lines").select("id, budget_id, amount_cents").eq("community_id", cid).order("id").range(from, to)),
    supabase.from("levies").select("id, title, description, total_cents, due_date").eq("community_id", cid)
      .order("due_date", { ascending: false }),
  ]);
  const schedules = (schedulesRes.data ?? []) as Schedule[];
  const schedule = schedules.find((x) => x.year === year) ?? null;
  const units = unitsRes.rows;
  const levies = (leviesRes.data ?? []) as Levy[];

  // Charges for this schedule and for all levies (only what is needed for the totals).
  const [schedChargesRes, levyChargesRes] = await Promise.all([
    schedule
      ? fetchAll<ChargeLite>((from, to) => supabase.from("fee_charges")
          .select("id, schedule_id, levy_id, period_label, due_date, amount_cents, paid_cents")
          .eq("community_id", cid).eq("schedule_id", schedule.id).order("id").range(from, to))
      : Promise.resolve({ rows: [] as ChargeLite[], error: null }),
    levies.length > 0
      ? fetchAll<ChargeLite>((from, to) => supabase.from("fee_charges")
          .select("id, schedule_id, levy_id, period_label, due_date, amount_cents, paid_cents")
          .eq("community_id", cid).not("levy_id", "is", null).order("id").range(from, to))
      : Promise.resolve({ rows: [] as ChargeLite[], error: null }),
  ]);
  const loadFailed = !!(schedulesRes.error || unitsRes.error || leviesRes.error || schedChargesRes.error || levyChargesRes.error);

  // Shares, used for the worked examples.
  const coefs = units.map((u) => num(u.coefficient));
  const totalCoef = coefs.reduce((t, c) => t + c, 0);
  const counts = new Map<number, number>();
  for (const c of coefs) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sampleCoef = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  // Budget totals per year, to pre-fill the schedule form.
  const lineTotals = new Map<string, number>();
  for (const l of linesRes.rows) lineTotals.set(l.budget_id, (lineTotals.get(l.budget_id) ?? 0) + num(l.amount_cents));
  const budgetsByYear: Record<string, { cents: number; name: string; status: string }> = {};
  for (const b of (budgetsRes.data ?? []) as { id: string; year: number; name: string; status: string }[]) {
    budgetsByYear[String(b.year)] = { cents: lineTotals.get(b.id) ?? 0, name: b.name, status: b.status };
  }
  const linkedBudget = schedule?.budget_id
    ? ((budgetsRes.data ?? []) as { id: string; name: string; status: string }[]).find((b) => b.id === schedule.budget_id) ?? null
    : null;

  // Years to offer: every year with a schedule, plus this year and next year.
  const years = Array.from(new Set([...schedules.map((x) => x.year), currentYear, currentYear + 1, year])).sort((a, b) => a - b);
  const freeYears = years.filter((y) => !schedules.some((x) => x.year === y) && (y >= currentYear - 1 || y === year));

  // Per-period summary
  const f = frequencyInfo(schedule?.frequency);
  const periods = new Map<string, { period_label: string; due_date: string; flats: number; amount_cents: number; paid_cents: number }>();
  for (const c of schedChargesRes.rows) {
    const k = `${c.due_date}|${c.period_label}`;
    const p = periods.get(k) ?? { period_label: c.period_label, due_date: c.due_date, flats: 0, amount_cents: 0, paid_cents: 0 };
    p.flats += 1;
    p.amount_cents += num(c.amount_cents);
    p.paid_cents += num(c.paid_cents);
    periods.set(k, p);
  }
  const periodRows = Array.from(periods.values())
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((p) => ({ ...p, open_cents: p.amount_cents - p.paid_cents }));
  const expected = units.length * f.periods;
  const created = schedChargesRes.rows.length;
  const annualTotal = schedule
    ? schedule.method === "fixed" ? num(schedule.fixed_amount_cents) * f.periods * units.length : num(schedule.annual_total_cents)
    : 0;

  const periodColumns: Column[] = [
    { key: "period_label", header: "Period", primary: true },
    { key: "due_date", header: "Due", type: "date" },
    { key: "flats", header: "Flats charged", type: "number" },
    { key: "amount_cents", header: "Total charged", type: "money", total: true },
    { key: "paid_cents", header: "Total paid", type: "money", total: true },
    { key: "open_cents", header: "Still to pay", type: "money", total: true },
  ];

  // Levies
  const levyTotals = new Map<string, { flats: number; amount: number; paid: number }>();
  for (const c of levyChargesRes.rows) {
    if (!c.levy_id) continue;
    const t = levyTotals.get(c.levy_id) ?? { flats: 0, amount: 0, paid: 0 };
    t.flats += 1;
    t.amount += num(c.amount_cents);
    t.paid += num(c.paid_cents);
    levyTotals.set(c.levy_id, t);
  }
  const levyRows = levies.map((l) => {
    const t = levyTotals.get(l.id) ?? { flats: 0, amount: 0, paid: 0 };
    return {
      id: l.id, title: l.title, description: l.description ?? "", due_date: l.due_date, total_cents: num(l.total_cents),
      flats: t.flats, charged_cents: t.amount, paid_cents: t.paid, open_cents: t.amount - t.paid,
    };
  });
  const unshared = levyRows.filter((l) => units.length > 0 && l.flats < units.length);
  const levyColumns: Column[] = [
    { key: "title", header: "Levy", primary: true, subKey: "description" },
    { key: "due_date", header: "Due", type: "date" },
    { key: "total_cents", header: "Levy total", type: "money", total: true },
    { key: "flats", header: "Flats charged", type: "number" },
    { key: "charged_cents", header: "Charged", type: "money", total: true },
    { key: "paid_cents", header: "Paid", type: "money", total: true },
    { key: "open_cents", header: "Still to pay", type: "money", total: true },
  ];

  return (
    <>
      <PageHeader
        title="Fee schedule & levies"
        intro="Set how much owners pay each year, and add one-off extra charges (levies)."
        back={{ href: `${base}/finance/fees`, label: "Owner fees" }}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-8">
        {loadFailed && <Notice tone="bad">Some figures could not be loaded. Please refresh the page.</Notice>}
        {sp.created && schedule && (
          <Notice tone="ok">The fee schedule for {year} was saved. Next step: press “Create the charges for this year” below.</Notice>
        )}

        <nav aria-label="Choose a year" className="no-print flex flex-wrap items-center gap-2">
          <span className="font-bold">Year:</span>
          {years.map((y) => (
            <Link key={y} href={`${base}/finance/fees/schedule?year=${y}`} aria-current={y === year ? "page" : undefined}
              className={clsx("inline-flex min-h-12 items-center rounded-full border-2 px-5 font-bold no-underline",
                y === year ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand")}>
              {y}
            </Link>
          ))}
        </nav>

        <section aria-labelledby="schedule-heading" className="flex flex-col gap-4">
          <h2 id="schedule-heading" className="text-2xl font-bold">Regular fees for {year}</h2>
          {schedule ? (
            <>
              <Card className="flex flex-col gap-4">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                  <dt className="font-bold">How often owners pay</dt><dd>{f.label}</dd>
                  <dt className="font-bold">How each fee is worked out</dt>
                  <dd>{schedule.method === "fixed" ? "The same amount for every flat" : "By each flat’s share (coefficient)"}</dd>
                  {schedule.method === "fixed" ? (
                    <>
                      <dt className="font-bold">Amount per flat</dt>
                      <dd className="tabular">{m(num(schedule.fixed_amount_cents))} per {f.per}</dd>
                    </>
                  ) : null}
                  <dt className="font-bold">Total for the year</dt>
                  <dd className="tabular">{m(annualTotal)}{schedule.method === "fixed" && <span className="text-muted"> (for {plural(units.length, "flat")})</span>}</dd>
                  <dt className="font-bold">Based on budget</dt>
                  <dd>{linkedBudget ? `${linkedBudget.name} (${linkedBudget.status === "approved" ? "approved" : "draft"})` : "Not linked to a budget"}</dd>
                  <dt className="font-bold">Charges created</dt>
                  <dd className="tabular">
                    {created} of {expected}{" "}
                    <span className="text-muted">({plural(units.length, "flat")} × {plural(f.periods, "period")})</span>
                  </dd>
                </dl>
                {created < expected ? (
                  <Notice tone="warn">
                    {created === 0 ? "No charges have been created for this year yet." : `${plural(expected - created, "charge")} still to be created.`}
                    {" "}Owners only see fees once the charges exist.
                  </Notice>
                ) : (
                  <Notice tone="ok">All charges for {year} have been created.</Notice>
                )}
                <div className="no-print">
                  <ActionForm
                    action={generateCharges.bind(null, s.community.slug, schedule.id)}
                    label="Create the charges for this year"
                    pendingLabel="Creating the charges…"
                    variant={created < expected ? "primary" : "secondary"}
                    confirm={<>This adds a fee to each of the {plural(units.length, "flat")} for every {f.per} of {year} that does not have one yet. Fees that already exist are not changed.</>}
                    confirmLabel="Yes, create the charges"
                  />
                </div>
              </Card>

              <DataTable id="periods-" rows={periodRows} columns={periodColumns} currency={currency}
                defaultSort={{ key: "due_date" }} exportName={`fees-${year}-periods`}
                searchPlaceholder="Search periods…" empty="No charges yet. Press “Create the charges for this year” above." />
            </>
          ) : (
            <Card className="flex flex-col gap-3">
              <h3 className="text-xl font-bold">Set up the fees for {year}</h3>
              <p className="text-muted">
                There is no fee schedule for {year} yet. Choose how often owners pay and how much the community needs to collect.
              </p>
              {units.length === 0 && <Notice tone="warn">This community has no flats yet. Add the flats first, in Administration.</Notice>}
              <ScheduleForm
                slug={s.community.slug}
                years={freeYears.length > 0 ? freeYears : [year]}
                defaultYear={freeYears.includes(year) ? year : freeYears[0] ?? year}
                budgets={budgetsByYear}
                sampleCoef={sampleCoef}
                totalCoef={totalCoef}
                unitCount={units.length}
                currency={currency}
              />
            </Card>
          )}
        </section>

        <section aria-labelledby="levies-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="levies-heading" className="text-2xl font-bold">Extraordinary levies</h2>
            <p className="text-muted">
              A levy is a one-off extra charge agreed by the owners, for example to repair the roof. The total is split between all
              flats by their share.
            </p>
          </div>

          {unshared.map((l) => (
            <Card key={l.id} className="no-print flex flex-col gap-3 !border-2 !border-warn">
              <p className="font-bold">
                “{l.title}” has been charged to {l.flats} of {plural(units.length, "flat")}.
              </p>
              <ActionForm
                action={allocateLevy.bind(null, s.community.slug, l.id)}
                label="Charge the flats"
                pendingLabel="Charging the flats…"
                confirm={<>This adds “{l.title}” to each flat that does not have it yet, split by share.</>}
                confirmLabel="Yes, charge the flats"
              />
            </Card>
          ))}

          <DataTable id="levies-" rows={levyRows} columns={levyColumns} currency={currency}
            dateKey="due_date" defaultSort={{ key: "due_date", desc: true }} exportName="levies"
            searchPlaceholder="Search levies…" empty="No extraordinary levies yet." />

          <Card className="no-print flex flex-col gap-3">
            <h3 className="text-xl font-bold">New extraordinary levy</h3>
            <LevyForm slug={s.community.slug} defaultDue={addDays(today, 30)} sampleCoef={sampleCoef} totalCoef={totalCoef}
              unitCount={units.length} currency={currency} />
          </Card>
        </section>
      </div>
    </>
  );
}
