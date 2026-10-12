import Link from "next/link";
import { AlarmClock, CalendarRange, CircleCheck, HandCoins, Hammer, Plus, Receipt } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Badge, Button, Card, Notice, SectionHeader, Stat, TabLinks } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { ConfirmDialog } from "@/components/finance-ops/ConfirmDialog";
import { Flash } from "@/components/finance-ops/Flash";
import { SubmitButton } from "@/components/finance-ops/SubmitButton";
import { daysBetween, frequencyLabel, relativeDays } from "@/components/finance-ops/dates";
import { peopleByUnit } from "@/components/finance-ops/people";
import { deleteSchedule, generateCharges, sendReminder, splitLevy } from "./actions";

export const metadata = { title: "Owner fees" };

type Balance = {
  unit_id: string; label: string; building_name: string | null; coefficient: number;
  charged_cents: number; paid_cents: number; overdue_cents: number; oldest_unpaid_due: string | null; last_reminder_at: string | null;
};
type Charge = { unit_id: string; schedule_id: string | null; levy_id: string | null; period_label: string; due_date: string; amount_cents: number; paid_cents: number; status: string };

const NOTICES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  "schedule=created": { tone: "ok", text: "Fee schedule saved. Generate the charges when you are ready." },
  "schedule=deleted": { tone: "ok", text: "Fee schedule removed." },
  "levy=created": { tone: "ok", text: "Levy saved. Split it across the flats when you are ready." },
  "error=generate": { tone: "bad", text: "The charges could not be generated. Please try again." },
  "error=schedule_in_use": { tone: "bad", text: "This schedule already has charges, so it cannot be removed." },
  "error=schedule_delete": { tone: "bad", text: "The schedule could not be removed. Please try again." },
  "error=split": { tone: "bad", text: "The levy could not be split across the flats. Please try again." },
};

export default async function FeesPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}/finance/fees`;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);
  const year = Number(today.slice(0, 4));
  const tab = sp.tab === "flats" || sp.tab === "levies" ? sp.tab : "overview";

  const [{ data: balanceData }, { data: chargeData }, { data: schedules }, { data: levies }] = await Promise.all([
    supabase.from("v_unit_balance").select("unit_id, label, building_name, coefficient, charged_cents, paid_cents, overdue_cents, oldest_unpaid_due, last_reminder_at")
      .eq("community_id", c).order("label"),
    supabase.from("fee_charges").select("unit_id, schedule_id, levy_id, period_label, due_date, amount_cents, paid_cents, status").eq("community_id", c),
    supabase.from("fee_schedules").select("id, year, frequency, method, annual_total_cents, fixed_amount_cents, budget_id").eq("community_id", c).order("year", { ascending: false }),
    supabase.from("levies").select("id, title, description, total_cents, due_date, created_at").eq("community_id", c).order("due_date", { ascending: false }),
  ]);
  const balances = (balanceData ?? []) as Balance[];
  const charges = (chargeData ?? []) as Charge[];
  const { owners } = await peopleByUnit(supabase, c, balances.map((b) => ({ id: b.unit_id, label: b.label })));
  const ownerNames = (unitId: string) => (owners.get(unitId) ?? []).map((p) => p.name).join(", ");

  // Year figures (charges due this year, including levies).
  const thisYear = charges.filter((ch) => ch.due_date.startsWith(String(year)));
  const expected = thisYear.reduce((t, ch) => t + Number(ch.amount_cents), 0);
  const collected = thisYear.reduce((t, ch) => t + Number(ch.paid_cents), 0);
  const overdueTotal = balances.reduce((t, b) => t + Number(b.overdue_cents), 0);
  const notYetDue = charges.filter((ch) => ch.due_date > today).reduce((t, ch) => t + Number(ch.amount_cents) - Number(ch.paid_cents), 0);
  const arrears = balances.filter((b) => Number(b.overdue_cents) > 0).sort((a, b) => Number(b.overdue_cents) - Number(a.overdue_cents));

  // Calendar day of a timestamp in the community's time zone (not UTC, not the browser's).
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: s.community.timezone });
  const localDay = (ts: string | null) => (ts ? dayFmt.format(new Date(ts)) : null);

  const oldestPeriod = (unitId: string) => charges
    .filter((ch) => ch.unit_id === unitId && ch.status !== "paid" && ch.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.period_label ?? null;

  const notice = Object.entries(NOTICES).find(([k]) => { const [key, val] = k.split("="); return sp[key] === val; })?.[1];
  const generated = sp.generated != null ? Number(sp.generated) : null;

  return (
    <>
      <Toolbar
        title="Owner fees"
        description="Fees per flat. Payments are recorded by hand; there is no online payment."
        actions={<Button href={`${base}/payments/new`}><HandCoins aria-hidden className="size-4" /> Record a payment</Button>}
      />
      <TabLinks label="Owner fee sections" tabs={[
        { href: base, label: "Overview", active: tab === "overview" },
        { href: `${base}?tab=flats`, label: "All flats", active: tab === "flats", count: balances.length },
        { href: `${base}?tab=levies`, label: "Levies", active: tab === "levies", count: (levies ?? []).length },
      ]} />

      <div className="flex flex-col gap-5">
        {(notice || generated != null || sp.levy === "split") && (
        <Flash>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {generated != null && (
          <Notice tone="ok" title={generated ? `${generated} charges added` : "Nothing new to add"}>
            {generated
              ? `Every flat now has its ${sp.year ?? ""} charges. Owners see them in My flat.`
              : `Every flat already has all its ${sp.year ?? ""} charges, so nothing was charged twice.`}
          </Notice>
        )}
        {sp.levy === "split" && <Notice tone="ok">Levy split across {sp.n ?? "all"} flats by participation coefficient.</Notice>}
        </Flash>
        )}

        {tab === "overview" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={`Expected in ${year}`} value={money(expected, cur)} sub="Fees and levies due this year" />
              <Stat label="Collected" value={money(collected, cur)} sub={expected ? `${Math.round((collected / expected) * 100)}% of this year's charges` : undefined} tone="ok" />
              <Stat label="Overdue" value={money(overdueTotal, cur)} tone={overdueTotal > 0 ? "bad" : undefined} sub={`${money(notYetDue, cur)} more not due yet`} />
              <Stat label="Flats in arrears" value={arrears.length} tone={arrears.length ? "warn" : undefined} sub={`of ${balances.length} flats`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card padded={false} className="lg:col-span-2">
                <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                  <SectionHeader icon={AlarmClock} title="Arrears"
                    description={arrears.length ? "Flats with fees past their due date, largest first" : undefined}
                    action={arrears.length ? <Button href={`${base}?tab=flats&f_status=overdue`} variant="ghost" size="sm">Table view</Button> : undefined} />
                </div>
                {arrears.length === 0 ? (
                  <div className="px-5 pb-6 sm:px-6"><p className="flex items-center gap-2 text-[0.9375rem] text-muted"><CircleCheck aria-hidden className="size-4 text-ok" /> Every flat is up to date.</p></div>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {arrears.map((b) => {
                      const since = b.oldest_unpaid_due;
                      const days = since ? daysBetween(since, today) : 0;
                      return (
                        <li key={b.unit_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <Link href={`${base}/${b.unit_id}`} className="font-medium no-underline hover:underline">Flat {b.label}</Link>
                              <span className="text-sm text-muted">{b.building_name}</span>
                            </div>
                            <div className="truncate text-[0.9375rem] text-ink-2">{ownerNames(b.unit_id) || "No owner on record"}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                              <Badge tone={days > 90 ? "bad" : "warn"}>{days} days overdue</Badge>
                              <span>Since {oldestPeriod(b.unit_id) ?? date(since)}</span>
                              <span>{b.last_reminder_at ? `Reminded ${relativeDays(-daysBetween(localDay(b.last_reminder_at)!, today))}` : "No reminder yet"}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
                            <div className="tabular text-[1.125rem] font-semibold text-bad">{money(b.overdue_cents, cur)}</div>
                            <div className="flex flex-wrap gap-2">
                              <Button href={`${base}/payments/new?unit=${b.unit_id}`} variant="secondary" size="sm">Record payment</Button>
                              <ConfirmDialog
                                label="Send reminder"
                                size="sm"
                                variant="soft"
                                confirmVariant="primary"
                                title={`Remind the owner of flat ${b.label}?`}
                                description={`${ownerNames(b.unit_id) || "The owner"} will get a message in the app: ${money(b.overdue_cents, cur)} outstanding since ${date(since)}.`}
                                confirmLabel="Send reminder"
                                pendingLabel="Sending…"
                                action={sendReminder.bind(null, slug, b.unit_id)}
                              >
                                <div className="field">
                                  <label htmlFor={`note-${b.unit_id}`}>Personal note <span className="font-normal text-muted">(optional)</span></label>
                                  <textarea id={`note-${b.unit_id}`} name="note" maxLength={500} className="input min-h-20" placeholder={`e.g. Please use the reference CUOTA ${b.label}.`} />
                                </div>
                              </ConfirmDialog>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="flex flex-col">
                <SectionHeader icon={CalendarRange} title="Fee schedule" description="How the yearly fees are split into charges" />
                {(schedules ?? []).length === 0 ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-[0.9375rem] text-muted">No fee schedule yet. Set how much to collect each year and how often owners pay.</p>
                    <Button href={`${base}/schedule/new`}><Plus aria-hidden className="size-4" /> Set up fees</Button>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {(schedules ?? []).slice(0, 3).map((sc) => {
                      const periods = sc.frequency === "monthly" ? 12 : sc.frequency === "quarterly" ? 4 : 1;
                      const mine = charges.filter((ch) => ch.schedule_id === sc.id);
                      const done = new Set(mine.map((ch) => ch.period_label)).size;
                      const complete = done >= periods && mine.length >= periods * balances.length;
                      return (
                        <li key={sc.id} className="rounded-xl bg-surface-2 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{sc.year}</span>
                            {complete ? <Badge tone="ok">Charged</Badge> : done ? <Badge tone="warn">{done} of {periods} periods</Badge> : <Badge tone="neutral">No charges yet</Badge>}
                          </div>
                          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.9375rem]">
                            <dt className="text-muted">Paid</dt><dd>{frequencyLabel(sc.frequency)}</dd>
                            <dt className="text-muted">{sc.method === "fixed" ? "Per flat" : "Per year"}</dt>
                            <dd className="tabular">{sc.method === "fixed" ? `${money(sc.fixed_amount_cents, cur)} a period` : money(sc.annual_total_cents, cur)}</dd>
                            <dt className="text-muted">Split</dt><dd>{sc.method === "fixed" ? "Same amount per flat" : "By participation coefficient"}</dd>
                          </dl>
                          {!complete && (
                            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                              <p className="text-sm text-muted">
                                Creates the {sc.year} {sc.frequency === "yearly" ? "charge" : `${frequencyLabel(sc.frequency).toLowerCase()} charges`} for all {balances.length} flats.
                                Periods that already exist are skipped, so nothing is charged twice.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <form action={generateCharges.bind(null, slug, sc.id)}>
                                  <SubmitButton size="sm" pendingLabel="Generating…">Generate charges</SubmitButton>
                                </form>
                                {mine.length === 0 && (
                                  <ConfirmDialog label="Remove" size="sm" variant="ghost" title={`Remove the ${sc.year} schedule?`}
                                    description="It has no charges yet, so nothing else changes." confirmLabel="Remove schedule" pendingLabel="Removing…"
                                    action={deleteSchedule.bind(null, slug, sc.id)} />
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(schedules ?? []).length > 0 && !(schedules ?? []).some((sc) => sc.year === year + 1) && (
                  <div className="mt-auto pt-4">
                    <Button href={`${base}/schedule/new?year=${year + 1}`} variant="ghost" size="sm"><Plus aria-hidden className="size-4" /> Set up {year + 1}</Button>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {tab === "flats" && (
          <div className="relative overflow-x-clip">
            <DataTable
              rows={balances.map((b) => ({
                unit_id: b.unit_id,
                label: b.label,
                building_name: b.building_name ?? "",
                owner: ownerNames(b.unit_id),
                overdue_cents: Number(b.overdue_cents),
                oldest: Number(b.overdue_cents) > 0 ? oldestPeriod(b.unit_id) : null,
                days_overdue: b.oldest_unpaid_due && Number(b.overdue_cents) > 0 ? daysBetween(b.oldest_unpaid_due, today) : null,
                last_reminder_at: localDay(b.last_reminder_at),
                status: Number(b.overdue_cents) > 0 ? "overdue" : "paid",
              }))}
              columns={[
                { key: "label", header: "Flat", href: `${base}/{unit_id}` },
                { key: "building_name", header: "Block", filter: true },
                { key: "owner", header: "Owner" },
                { key: "overdue_cents", header: "Owed now", type: "money", total: true, subKey: "oldest" },
                { key: "days_overdue", header: "Days overdue", type: "number", mobileHidden: true },
                { key: "last_reminder_at", header: "Last reminder", type: "date", mobileHidden: true },
                { key: "status", header: "Status", type: "status", filter: true },
              ] satisfies Column[]}
              views={[
                { label: "In arrears", params: { f_status: "overdue" } },
                { label: "Up to date", params: { f_status: "paid" } },
              ]}
              defaultSort={{ key: "overdue_cents", desc: true }}
              exportName="owner-fees"
              searchPlaceholder="Search flat or owner…"
              empty="No flats match."
            />
          </div>
        )}

        {tab === "levies" && (
          <Card padded={false}>
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Hammer} title="Extraordinary levies" description="One-off contributions (derramas) for approved works"
                action={<Button href={`${base}/levies/new`} size="sm" variant="soft"><Plus aria-hidden className="size-4" /> New levy</Button>} />
            </div>
            {(levies ?? []).length === 0 ? (
              <p className="flex items-center gap-2 px-5 pb-6 text-[0.9375rem] text-muted sm:px-6">
                <Receipt aria-hidden className="size-4 shrink-0" /> No levies yet. When a meeting approves extra works, add one here and split it across the flats.
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {(levies ?? []).map((l) => {
                  const mine = charges.filter((ch) => ch.levy_id === l.id);
                  const paid = mine.reduce((t, ch) => t + Number(ch.paid_cents), 0);
                  const allocated = mine.reduce((t, ch) => t + Number(ch.amount_cents), 0);
                  const pct = allocated ? Math.round((paid / allocated) * 100) : 0;
                  const dueIn = daysBetween(today, l.due_date);
                  return (
                    <li key={l.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{l.title}</div>
                        {l.description && <p className="text-[0.9375rem] text-muted">{l.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span>Due {date(l.due_date)} ({relativeDays(dueIn)})</span>
                          {mine.length ? <span>Split across {mine.length} flats</span> : <Badge tone="warn">Not split yet</Badge>}
                        </div>
                        {mine.length > 0 && (
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-2 max-w-xs flex-1 rounded-full bg-surface-2 ring-1 ring-inset ring-line" role="img" aria-label={`${pct}% collected`}>
                              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm text-muted tabular">{pct}% collected</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
                        <div className="tabular text-[1.125rem] font-semibold">{money(l.total_cents, cur)}</div>
                        {mine.length === 0 && (
                          <form action={splitLevy.bind(null, slug, l.id)}>
                            <SubmitButton size="sm" pendingLabel="Splitting…">Split across flats</SubmitButton>
                          </form>
                        )}
                        {mine.length > 0 && <span className="text-sm text-muted tabular">{money(paid, cur)} received</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
