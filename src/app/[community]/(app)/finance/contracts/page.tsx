import { CalendarClock, FileSignature, Plus } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, moneyShort, todayInput } from "@/lib/format";
import { Button, Card, Empty, Notice, SectionHeader, TabLinks } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { KeyDatesTimeline, type TimelineContract } from "@/components/finance-ops/KeyDatesTimeline";
import { daysBetween, frequencyLabel, lengthLabel } from "@/components/finance-ops/dates";

export const metadata = { title: "Contracts" };

type KeyDates = {
  id: string; title: string; status: string; supplier_name: string; service_type: string; category_name: string | null;
  start_date: string; end_date: string | null; length_months: number | null; notice_period_days: number;
  notice_deadline: string | null; auto_renew: boolean; billing_frequency: string; amount_cents: number; annual_cost_cents: number;
};

const VIEWS = [
  { key: "active", label: "Active" },
  { key: "ending", label: "Ending in 90 days" },
  { key: "notice", label: "Notice deadline in 60 days" },
  { key: "renews", label: "Auto-renews" },
  { key: "all", label: "All" },
] as const;

export default async function ContractsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { community } = await params;
  const { view: viewParam } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance/contracts`;
  const today = todayInput(s.community.timezone);

  const { data, error } = await supabase.from("v_contract_key_dates")
    .select("id, title, status, supplier_name, service_type, category_name, start_date, end_date, length_months, notice_period_days, notice_deadline, auto_renew, billing_frequency, amount_cents, annual_cost_cents")
    .eq("community_id", s.community.id)
    .order("end_date", { ascending: true, nullsFirst: false });
  const all = (data ?? []) as KeyDates[];

  const days = (d: string | null) => (d ? daysBetween(today, d) : null);
  const active = all.filter((c) => c.status === "active");
  const matches: Record<(typeof VIEWS)[number]["key"], (c: KeyDates) => boolean> = {
    active: (c) => c.status === "active",
    ending: (c) => c.status === "active" && days(c.end_date) != null && days(c.end_date)! >= 0 && days(c.end_date)! <= 90,
    notice: (c) => c.status === "active" && days(c.notice_deadline) != null && days(c.notice_deadline)! >= 0 && days(c.notice_deadline)! <= 60,
    renews: (c) => c.status === "active" && c.auto_renew,
    all: () => true,
  };
  const view = VIEWS.find((v) => v.key === viewParam)?.key ?? "active";
  const shown = all.filter(matches[view]);

  const rows = shown.map((c) => ({
    id: c.id,
    title: c.title,
    service_type: c.service_type,
    supplier_name: c.supplier_name,
    end_date: c.end_date,
    term: c.end_date ? `${lengthLabel(c.length_months)} from ${date(c.start_date)}` : `Rolling since ${date(c.start_date)}`,
    notice_deadline: c.notice_deadline,
    notice: `${c.notice_period_days} days' notice`,
    auto_renew: c.auto_renew ? "Yes" : "No",
    annual_cost_cents: c.annual_cost_cents,
    billing: `${frequencyLabel(c.billing_frequency)}: ${money(c.amount_cents, s.community.currency)}`,
    status: c.status,
  }));

  // Kept to what fits next to the sidebar; start, length, notice period and billing show as second lines.
  const columns: Column[] = [
    { key: "title", header: "Contract", href: `${base}/{id}`, primary: true, subKey: "service_type" },
    { key: "supplier_name", header: "Supplier" },
    { key: "end_date", header: "Ends", type: "date", subKey: "term" },
    { key: "notice_deadline", header: "Notice by", type: "date", subKey: "notice" },
    view === "all"
      ? { key: "status", header: "Status", type: "status", filter: true }
      : { key: "auto_renew", header: "Renews", filter: true },
    { key: "annual_cost_cents", header: "Per year", type: "money", total: true, subKey: "billing" },
  ];

  const timeline: TimelineContract[] = active
    .map((c) => ({
      id: c.id, title: c.title, supplier: c.supplier_name, notice_deadline: c.notice_deadline, end_date: c.end_date,
      auto_renew: c.auto_renew, notice_period_days: c.notice_period_days,
    }))
    .sort((a, b) => {
      const next = (c: TimelineContract) => [c.notice_deadline, c.end_date].filter((d): d is string => !!d && d >= today).sort()[0] ?? "9999";
      return next(a).localeCompare(next(b));
    });

  const yearly = active.reduce((t, c) => t + Number(c.annual_cost_cents), 0);
  const urgent = active.filter((c) => { const d = days(c.notice_deadline); return d != null && d >= 0 && d <= 30; }).length;

  return (
    <>
      <Toolbar
        title="Contracts"
        description={active.length ? `${active.length} active · ${moneyShort(yearly, s.community.currency)} a year` : undefined}
        actions={<Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> New contract</Button>}
      />

      {error && <div className="mb-5"><Notice tone="bad">Contracts could not be loaded. Please refresh the page.</Notice></div>}

      {all.length === 0 && !error ? (
        <Empty icon={FileSignature} title="No contracts yet"
          action={<Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> Add the first contract</Button>}>
          Add your supplier contracts to keep track of notice deadlines, renewals and yearly costs.
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {timeline.length > 0 && (
            <Card>
              <SectionHeader icon={CalendarClock} title="Key dates"
                description={urgent ? `${urgent} notice ${urgent === 1 ? "deadline" : "deadlines"} in the next 30 days` : "The next 12 months"} />
              <KeyDatesTimeline contracts={timeline} today={today} hrefBase={base} />
            </Card>
          )}

          <section aria-labelledby="contract-list">
            <h3 id="contract-list" className="sr-only">Contract list</h3>
            <TabLinks label="Contract views" tabs={VIEWS.map((v) => ({
              href: v.key === "active" ? base : `${base}?view=${v.key}`,
              label: v.label,
              active: v.key === view,
              count: all.filter(matches[v.key]).length,
            }))} />
            {/* overflow-x-clip keeps the table's screen-reader sort labels from widening the page */}
            <div className="relative overflow-x-clip">
            <DataTable
              rows={rows}
              columns={columns}
              defaultSort={{ key: "notice_deadline" }}
              currency={s.community.currency}
              exportName="contracts"
              searchPlaceholder="Search contracts or suppliers…"
              empty={view === "active" ? "No active contracts." : "No contracts match this view."}
            />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
