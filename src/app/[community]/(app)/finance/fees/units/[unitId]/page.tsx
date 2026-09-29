import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Badge, Card, Notice, PageHeader, type Tone } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import PrintButton from "@/components/finance/fees/PrintButton";
import { communityNames, fetchAll } from "@/components/finance/fees/data";
import { addDays, channelLabel, dateInZone, daysBetween, methodLabel, num, plural, timeInZone } from "@/components/finance/fees/utils";
import PaymentForm from "./PaymentForm";
import ReminderForm from "./ReminderForm";

export const metadata = { title: "Flat statement" };

type Unit = { id: string; label: string; coefficient: number | string | null; floor: number | null; building: { name: string } | null };
type Charge = { id: string; period_label: string; due_date: string; amount_cents: number; paid_cents: number; status: string; levy_id: string | null };
type Payment = { id: string; paid_on: string; amount_cents: number; method: string; reference: string | null; unallocated_cents: number; created_at: string };
type Reminder = { id: string; channel: string; sent_at: string; note: string | null };

export default async function FlatStatementPage({ params }: { params: Promise<{ community: string; unitId: string }> }) {
  const { community, unitId } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;
  const currency = s.community.currency;
  const tz = s.community.timezone;
  const today = todayInput(tz);
  const m = (c: number) => money(c, currency);

  const { data: unitData } = await supabase.from("units")
    .select("id, label, coefficient, floor, building:buildings(name)")
    .eq("id", unitId).eq("community_id", cid).maybeSingle();
  if (!unitData) notFound();
  const unit = unitData as unknown as Unit;

  const [chargesRes, paymentsRes, remindersRes, ownershipsRes] = await Promise.all([
    fetchAll<Charge>((from, to) => supabase.from("fee_charges")
      .select("id, period_label, due_date, amount_cents, paid_cents, status, levy_id")
      .eq("community_id", cid).eq("unit_id", unit.id).order("due_date").order("created_at").range(from, to)),
    fetchAll<Payment>((from, to) => supabase.from("fee_payments")
      .select("id, paid_on, amount_cents, method, reference, unallocated_cents, created_at")
      .eq("community_id", cid).eq("unit_id", unit.id).order("paid_on", { ascending: false }).order("created_at", { ascending: false }).range(from, to)),
    fetchAll<Reminder>((from, to) => supabase.from("fee_reminders")
      .select("id, channel, sent_at, note")
      .eq("community_id", cid).eq("unit_id", unit.id).order("sent_at", { ascending: false }).range(from, to)),
    supabase.from("unit_ownerships").select("owner_id, start_date, end_date")
      .eq("unit_id", unit.id).or(`end_date.is.null,end_date.gte.${today}`),
  ]);
  const loadFailed = !!(chargesRes.error || paymentsRes.error || remindersRes.error);
  const charges = chargesRes.rows;
  const payments = paymentsRes.rows;
  const reminders = remindersRes.rows;
  const ownerIds = ((ownershipsRes.data ?? []) as { owner_id: string }[]).map((o) => o.owner_id);
  const names = ownerIds.length > 0 ? await communityNames(supabase, cid, ownerIds) : new Map<string, string>();
  const ownerNames = Array.from(new Set(ownerIds.map((id) => names.get(id)).filter((n): n is string => !!n)));

  // Balance
  const charged = charges.reduce((t, c) => t + num(c.amount_cents), 0);
  const paid = charges.reduce((t, c) => t + num(c.paid_cents), 0);
  const credit = payments.reduce((t, p) => t + num(p.unallocated_cents), 0);
  const open = charges.filter((c) => num(c.amount_cents) > num(c.paid_cents));
  const overdueList = open.filter((c) => c.due_date <= today);
  const upcoming = open.filter((c) => c.due_date > today);
  const overdue = overdueList.reduce((t, c) => t + num(c.amount_cents) - num(c.paid_cents), 0);
  const notDue = upcoming.reduce((t, c) => t + num(c.amount_cents) - num(c.paid_cents), 0);
  const oldest = overdueList[0]?.due_date ?? null;
  const nextDue = upcoming[0]?.due_date ?? null;
  const stillToPay = charged - paid - credit;

  let tone: Tone = "ok";
  let word = "Fully paid";
  let explain = "All fees charged to this flat have been paid.";
  if (overdue > 0) {
    tone = "bad";
    word = "Overdue";
    explain = `${m(overdue)} is overdue. The oldest unpaid fee was due on ${date(oldest)}${oldest ? ` (${plural(Math.max(0, daysBetween(oldest, today)), "day")} ago)` : ""}.`;
  } else if (notDue > 0) {
    const soon = !!nextDue && nextDue <= addDays(today, 30);
    tone = soon ? "warn" : "info";
    word = soon ? "Due soon" : "Up to date";
    explain = `Nothing is overdue. The next fee of ${m(notDue)} is due on ${date(nextDue)}.`;
    if (upcoming.length > 1) explain = `Nothing is overdue. ${m(notDue)} is still to pay for ${plural(upcoming.length, "fee")} that are not due yet; the next one is due on ${date(nextDue)}.`;
  }

  const chargeRows = charges.map((c) => ({
    id: c.id,
    period_label: c.period_label,
    kind: c.levy_id ? "Extraordinary levy" : "Regular fee",
    due_date: c.due_date,
    amount_cents: num(c.amount_cents),
    paid_cents: num(c.paid_cents),
    open_cents: Math.max(0, num(c.amount_cents) - num(c.paid_cents)),
    status: c.status === "paid" ? "paid" : c.due_date > today ? "not_due_yet" : c.status,
  }));
  const chargeColumns: Column[] = [
    { key: "period_label", header: "Period", primary: true, subKey: "kind" },
    { key: "due_date", header: "Due", type: "date" },
    { key: "amount_cents", header: "Amount", type: "money", total: true },
    { key: "paid_cents", header: "Paid", type: "money", total: true },
    { key: "open_cents", header: "Still to pay", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  const paymentRows = payments.map((p) => ({
    id: p.id, paid_on: p.paid_on, amount_cents: num(p.amount_cents), method: methodLabel(p.method),
    reference: p.reference ?? "", unallocated_cents: num(p.unallocated_cents),
  }));
  const paymentColumns: Column[] = [
    { key: "paid_on", header: "Date", type: "date", primary: true },
    { key: "amount_cents", header: "Amount", type: "money", total: true },
    { key: "method", header: "Method", filter: true },
    { key: "reference", header: "Reference" },
    { key: "unallocated_cents", header: "Left over as credit", type: "money", total: true },
  ];

  const reminderRows = reminders.map((r) => ({
    id: r.id, day: dateInZone(r.sent_at, tz), time: `at ${timeInZone(r.sent_at, tz)}`, channel: channelLabel(r.channel), note: r.note ?? "",
  }));
  const reminderColumns: Column[] = [
    { key: "day", header: "Date", type: "date", subKey: "time", primary: true },
    { key: "channel", header: "How", filter: true },
    { key: "note", header: "Note" },
  ];

  return (
    <>
      <PageHeader
        title={`Statement for flat ${unit.label}`}
        intro="All fees charged to this flat, the payments received, and reminders sent."
        back={{ href: `${base}/finance/fees`, label: "Owner fees" }}
        actions={<PrintButton label="Print statement" />}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-8">
        <p className="hidden print:block">{s.community.name} · Statement printed on {date(today)}</p>
        {loadFailed && <Notice tone="bad">Some of this flat’s records could not be loaded. Please refresh the page.</Notice>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-xl font-bold">Flat details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="font-bold">Flat</dt><dd>{unit.label}</dd>
              <dt className="font-bold">Block</dt><dd>{unit.building?.name ?? "—"}</dd>
              <dt className="font-bold">{ownerNames.length > 1 ? "Owners" : "Owner"}</dt>
              <dd>{ownerNames.length > 0 ? ownerNames.join(", ") : ownerIds.length > 0 ? "Owner’s name not available" : "No owner on file"}</dd>
              <dt className="font-bold">Share</dt>
              <dd className="tabular">{num(unit.coefficient).toFixed(2)}% <span className="text-muted">(the part of community costs this flat pays)</span></dd>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Balance</h2>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Badge tone={tone}>{word}</Badge>
              <span className="font-bold">{explain}</span>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
              <dt>Total charged</dt><dd className="tabular text-right">{m(charged)}</dd>
              <dt>Total paid towards fees</dt><dd className="tabular text-right">{m(paid)}</dd>
              {credit > 0 && (<><dt>Credit (paid in advance)</dt><dd className="tabular text-right">{m(credit)}</dd></>)}
              <dt className={overdue > 0 ? "font-bold text-bad" : ""}>Overdue now</dt>
              <dd className={`tabular text-right ${overdue > 0 ? "font-bold text-bad" : ""}`}>{m(overdue)}</dd>
              <dt>Not due yet</dt><dd className="tabular text-right">{m(notDue)}</dd>
              <dt className="border-t-2 border-line-strong pt-1 font-bold">{stillToPay >= 0 ? "Still to pay" : "In credit"}</dt>
              <dd className="tabular border-t-2 border-line-strong pt-1 text-right font-bold">{m(Math.abs(stillToPay))}</dd>
            </dl>
          </Card>
        </div>

        <Card className="no-print flex flex-col gap-3 !border-2 !border-brand">
          <h2 className="text-2xl font-bold">Record a payment</h2>
          <p className="text-muted">Use this when money from the owner of flat {unit.label} has arrived in the community’s bank account, or was paid in cash.</p>
          <PaymentForm slug={s.community.slug} unitId={unit.id} unitLabel={unit.label} today={today} currency={currency} />
        </Card>

        <section aria-labelledby="charges-heading" className="flex flex-col gap-3">
          <h2 id="charges-heading" className="text-2xl font-bold">Charges</h2>
          <DataTable id="charges-" rows={chargeRows} columns={chargeColumns} currency={currency}
            dateKey="due_date" defaultSort={{ key: "due_date" }} exportName={`fees-${unit.label}-charges`}
            searchPlaceholder="Search charges…" empty="No fees have been charged to this flat yet." />
        </section>

        <section aria-labelledby="payments-heading" className="flex flex-col gap-3">
          <h2 id="payments-heading" className="text-2xl font-bold">Payments</h2>
          <DataTable id="payments-" rows={paymentRows} columns={paymentColumns} currency={currency}
            dateKey="paid_on" defaultSort={{ key: "paid_on", desc: true }} exportName={`fees-${unit.label}-payments`}
            searchPlaceholder="Search payments…" empty="No payments recorded for this flat yet." />
        </section>

        <section aria-labelledby="reminders-heading" className="flex flex-col gap-3">
          <h2 id="reminders-heading" className="text-2xl font-bold">Reminders</h2>
          <Card className="no-print flex flex-col gap-3">
            <h3 className="text-xl font-bold">Log a reminder</h3>
            <p className="text-muted">Keep a note each time the owner is reminded to pay, so everyone on the committee can see it.</p>
            <ReminderForm slug={s.community.slug} unitId={unit.id} />
          </Card>
          <DataTable id="reminders-" rows={reminderRows} columns={reminderColumns}
            defaultSort={{ key: "day", desc: true }} exportName={`fees-${unit.label}-reminders`}
            searchPlaceholder="Search reminders…" empty="No reminders have been logged for this flat." />
        </section>
      </div>
    </>
  );
}
