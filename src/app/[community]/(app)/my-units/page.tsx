import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, Check, CheckCircle2, X } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import PrintButton from "@/components/owner/PrintButton";
import AddTenantForm from "@/components/owner/AddTenantForm";
import TenancyActions, { type TenancyForActions } from "@/components/owner/TenancyActions";
import { paymentMethodLabel, tenancyTypeLabel } from "@/components/owner/labels";
import { addTenant, changeTenancyEndDate, endTenancy } from "./actions";

export const metadata = { title: "My flat & fees" };

type Flat = { id: string; label: string; building: string | null; buildingSort: number; coefficient: number };

type Charge = {
  id: string; unit_id: string; levy_id: string | null; period_label: string; due_date: string;
  amount_cents: number; paid_cents: number; status: string; levy: { title: string } | null;
};

type Payment = {
  id: string; unit_id: string; paid_on: string; amount_cents: number; method: string;
  reference: string | null; unallocated_cents: number;
};

type Tenancy = {
  id: string; tenant_id: string; tenancy_type: string; start_date: string; end_date: string | null;
  status: string; note: string | null;
};

type Balance = {
  paid: number; toPay: number; overdue: number; credit: number; oldestOverdue: string | null;
  next: { label: string; due_date: string; open: number } | null;
};

const open = (c: Charge) => Math.max(0, Number(c.amount_cents) - Number(c.paid_cents));

/** Balance for one flat. "Overdue" uses the same rule as the office's arrears view: due on or before today. */
function balanceFor(charges: Charge[], payments: Payment[], today: string): Balance {
  const credit = payments.reduce((n, p) => n + (Number(p.unallocated_cents) || 0), 0);
  const paid = charges.reduce((n, c) => n + (Number(c.paid_cents) || 0), 0);
  const outstanding = charges.reduce((n, c) => n + open(c), 0);
  const late = charges.filter((c) => c.due_date <= today && open(c) > 0);
  const overdueRaw = late.reduce((n, c) => n + open(c), 0);
  const oldestOverdue = late.map((c) => c.due_date).sort()[0] ?? null;
  const upcoming = charges.filter((c) => c.due_date > today && open(c) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return {
    paid,
    credit,
    toPay: Math.max(0, outstanding - credit),
    overdue: Math.max(0, overdueRaw - credit),
    oldestOverdue,
    next: upcoming ? { label: chargeName(upcoming), due_date: upcoming.due_date, open: open(upcoming) } : null,
  };
}

function chargeName(c: Charge) {
  return c.levy_id ? `Extra levy: ${c.levy?.title ?? c.period_label}` : `Community fees ${c.period_label}`;
}

export default async function MyUnitsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ flat?: string; ended?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const base = `/${s.community.slug}`;
  if (!s.isOwner) redirect(`${base}/home`);

  const supabase = await createClient();
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);

  // The owner's current flats (ownership without an end date, or ending in the future).
  const { data: ownRaw } = await supabase
    .from("unit_ownerships")
    .select("unit_id, unit:units(id, label, coefficient, building:buildings(name, sort))")
    .eq("community_id", s.community.id)
    .eq("owner_id", s.userId)
    .or(`end_date.is.null,end_date.gte.${today}`);

  const flatMap = new Map<string, Flat>();
  for (const o of (ownRaw ?? []) as unknown as {
    unit: { id: string; label: string; coefficient: number | string | null; building: { name: string; sort: number } | null } | null;
  }[]) {
    if (!o.unit || flatMap.has(o.unit.id)) continue;
    flatMap.set(o.unit.id, {
      id: o.unit.id,
      label: o.unit.label,
      building: o.unit.building?.name ?? null,
      buildingSort: o.unit.building?.sort ?? 0,
      coefficient: Number(o.unit.coefficient) || 0,
    });
  }
  const flats = [...flatMap.values()].sort((a, b) => a.buildingSort - b.buildingSort || a.label.localeCompare(b.label, "en", { numeric: true }));

  if (flats.length === 0) {
    return (
      <>
        <PageHeader title="My flat" intro="Your fees, payments and tenants." />
        <Empty title="We could not find a flat linked to your account.">
          If you own a flat here, please contact the office so they can link it to you.
        </Empty>
      </>
    );
  }

  const flat = flats.find((f) => f.id === sp.flat) ?? flats[0];
  const unitIds = flats.map((f) => f.id);

  // RLS: owners read only their own flats' charges and payments.
  const [chargesRes, paymentsRes, tenanciesRes, directoryRes, namesRes] = await Promise.all([
    supabase
      .from("fee_charges")
      .select("id, unit_id, levy_id, period_label, due_date, amount_cents, paid_cents, status, levy:levies(title)")
      .eq("community_id", s.community.id)
      .in("unit_id", unitIds)
      .order("due_date", { ascending: false }),
    supabase
      .from("fee_payments")
      .select("id, unit_id, paid_on, amount_cents, method, reference, unallocated_cents")
      .eq("community_id", s.community.id)
      .in("unit_id", unitIds)
      .order("paid_on", { ascending: false }),
    supabase
      .from("tenancies")
      .select("id, tenant_id, tenancy_type, start_date, end_date, status, note")
      .eq("community_id", s.community.id)
      .eq("unit_id", flat.id)
      .order("start_date", { ascending: false }),
    // Owners cannot read other people's profiles directly; the directory gives names of active members.
    supabase.rpc("directory", { c: s.community.id }),
    // Optional helper (see schema notes): tenant names for this flat, including pending/ended tenancies.
    supabase.rpc("unit_tenant_names", { u: flat.id }),
  ]);

  const charges = (chargesRes.data ?? []) as unknown as Charge[];
  const payments = (paymentsRes.data ?? []) as unknown as Payment[];
  const loadFailed = !!chargesRes.error || !!paymentsRes.error;

  const balances = new Map<string, Balance>(
    flats.map((f) => [f.id, balanceFor(charges.filter((c) => c.unit_id === f.id), payments.filter((p) => p.unit_id === f.id), today)]),
  );
  const b = balances.get(flat.id)!;

  // --- Fee statement rows -------------------------------------------------------------------
  const chargeRows = charges.filter((c) => c.unit_id === flat.id).map((c) => ({
    id: c.id,
    period: c.levy_id ? c.levy?.title ?? c.period_label : c.period_label,
    type: c.levy_id ? "Extra levy (one-off)" : "Community fees",
    due_date: c.due_date,
    amount: Number(c.amount_cents),
    paid: Number(c.paid_cents),
    to_pay: open(c),
    status: c.status,
  }));
  const chargeColumns: Column[] = [
    { key: "period", header: "Period", primary: true },
    { key: "type", header: "Type", filter: true },
    { key: "due_date", header: "Due date", type: "date" },
    { key: "amount", header: "Amount", type: "money", total: true },
    { key: "paid", header: "Paid", type: "money", total: true },
    { key: "to_pay", header: "Still to pay", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  // --- Payment rows -------------------------------------------------------------------------
  const paymentRows = payments.filter((p) => p.unit_id === flat.id).map((p) => ({
    id: p.id,
    paid_on: p.paid_on,
    amount: Number(p.amount_cents),
    method: paymentMethodLabel(p.method),
    reference: p.reference ?? "",
  }));
  const paymentColumns: Column[] = [
    { key: "paid_on", header: "Date", type: "date", primary: true },
    { key: "amount", header: "Amount", type: "money", total: true },
    { key: "method", header: "Method", filter: true },
    { key: "reference", header: "Reference" },
  ];

  // --- Tenants ------------------------------------------------------------------------------
  const names = new Map<string, string>();
  for (const d of (directoryRes.data ?? []) as { profile_id: string; full_name: string | null }[]) {
    if (d.full_name) names.set(d.profile_id, d.full_name);
  }
  if (!namesRes.error) {
    for (const n of (namesRes.data ?? []) as { tenant_id: string; full_name: string | null }[]) {
      if (n.full_name) names.set(n.tenant_id, n.full_name);
    }
  }
  const tenancies = (tenanciesRes.data ?? []) as unknown as Tenancy[];
  const tenantName = (t: Tenancy) =>
    names.get(t.tenant_id) ?? (t.status === "pending" ? "New tenant (name shown after approval)" : t.status === "ended" ? "Former tenant" : "Tenant");

  const tenancyRows = tenancies.map((t) => ({
    id: t.id,
    name: tenantName(t),
    type: tenancyTypeLabel(t.tenancy_type),
    start_date: t.start_date,
    ends: t.end_date ? date(t.end_date) : "No end date",
    status: t.status,
    note: t.note ?? "",
  }));
  const tenancyColumns: Column[] = [
    { key: "name", header: "Tenant", primary: true },
    { key: "type", header: "Type", filter: true },
    { key: "start_date", header: "Starts", type: "date" },
    { key: "ends", header: "Ends" },
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "note", header: "Note" },
  ];
  const current: TenancyForActions[] = tenancies
    .filter((t) => t.status === "active" || t.status === "pending")
    .map((t) => ({
      id: t.id,
      name: tenantName(t),
      typeLabel: tenancyTypeLabel(t.tenancy_type),
      status: t.status,
      start_date: t.start_date,
      end_date: t.end_date,
      startLabel: date(t.start_date),
      endLabel: date(t.end_date),
    }));

  const requiresApproval = !!s.community.settings?.tenant_requires_approval;
  const flatName = `Flat ${flat.label}${flat.building ? `, ${flat.building}` : ""}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={flats.length > 1 ? "My flats" : "My flat"}
        intro="Your community fees, the payments the office has recorded, and your tenants."
        actions={<PrintButton label="Print statement" />}
      />

      {sp.ended && <Notice tone="ok">The tenancy has been ended. Your former tenant no longer has access for this flat.</Notice>}
      {loadFailed && <Notice tone="warn">Some of your fee information could not be loaded just now. Please try again later.</Notice>}

      {flats.length > 1 && (
        <nav aria-labelledby="flats-h" className="no-print">
          <h2 id="flats-h" className="mb-3 text-xl font-bold">Choose a flat</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {flats.map((f) => {
              const fb = balances.get(f.id)!;
              const on = f.id === flat.id;
              return (
                <li key={f.id}>
                  <Link href={`${base}/my-units?flat=${f.id}`} aria-current={on ? "page" : undefined}
                    className={clsx("card flex min-h-24 flex-col items-start gap-2 rounded-card border-2 p-4 text-ink no-underline",
                      on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand")}>
                    <span className="text-lg font-bold">Flat {f.label}{f.building ? `, ${f.building}` : ""}</span>
                    {fb.overdue > 0
                      ? <Badge tone="bad">Overdue: {money(fb.overdue, cur)}</Badge>
                      : <Badge tone="ok">Up to date</Badge>}
                    {on && <span className="text-sm font-bold">Shown below</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <section aria-labelledby="flat-h" className="flex flex-col gap-6">
        <div>
          <h2 id="flat-h" className="text-2xl font-bold">{flatName}</h2>
          <p className="text-muted">
            Share of community costs: <strong className="text-ink">{flat.coefficient.toLocaleString("en-GB", { maximumFractionDigits: 4 })}%</strong>.
            {" "}This share decides how much of the community&apos;s costs this flat pays.
          </p>
          <p className="mt-1 hidden text-sm print:block">
            Fee statement for {flatName} · {s.fullName || s.email} · {s.community.name} · printed on {date(today)}
          </p>
        </div>

        {/* (a) Balance */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-xl font-bold">Your balance</h3>
          {b.overdue > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border-2 border-bad/40 bg-bad-soft p-4">
              <AlertTriangle aria-hidden className="mt-1 size-7 shrink-0 text-bad" />
              <div>
                <p className="text-2xl font-bold text-bad">Overdue: {money(b.overdue, cur)}</p>
                <p>
                  Some fees{b.oldestOverdue ? ` (the oldest was due on ${date(b.oldestOverdue)})` : ""} have not been paid yet.
                  Please pay as soon as you can. If you have already paid, the office may not have recorded it yet. Please contact them.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border-2 border-ok/40 bg-ok-soft p-4">
              <CheckCircle2 aria-hidden className="mt-1 size-7 shrink-0 text-ok" />
              <div>
                <p className="text-2xl font-bold text-ok">You are up to date</p>
                <p>Thank you. Nothing is overdue for this flat.</p>
              </div>
            </div>
          )}
          {b.next && (
            <p className="text-lg">
              Next payment: <strong className="tabular">{money(b.next.open, cur)}</strong> for {b.next.label}, due on <strong>{date(b.next.due_date)}</strong>.
            </p>
          )}
          {b.credit > 0 && (
            <p>You have <strong className="tabular">{money(b.credit, cur)}</strong> credit (money paid in advance). It will be used for your next charge.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Paid so far" value={money(b.paid, cur)} sub="Towards the charges below" />
            <Stat label="Still to pay" value={money(b.toPay, cur)} sub="Includes fees that are not due yet" />
            <Stat label="Overdue" value={money(b.overdue, cur)} tone={b.overdue > 0 ? "bad" : "ok"}
              sub={b.overdue > 0 ? "Past its due date: please pay" : "Nothing overdue"} />
          </div>
        </Card>

        {/* (b) Fee statement */}
        <section aria-labelledby="statement-h" className="flex flex-col gap-3">
          <h3 id="statement-h" className="text-xl font-bold">Fee statement</h3>
          <p className="max-w-3xl text-muted">
            Every charge for this flat. <strong className="text-ink">Community fees</strong> are the regular payments that cover the running
            costs of the community (cleaning, gardens, pool, insurance and so on). An <strong className="text-ink">extra levy</strong> is a
            one-off charge agreed at a meeting of owners, for example for roof repairs. It is shared between the flats in the same way.
            &quot;Partial&quot; means part of the amount has been paid.
          </p>
          <DataTable
            id="c"
            rows={chargeRows}
            columns={chargeColumns}
            currency={cur}
            dateKey="due_date"
            defaultSort={{ key: "due_date", desc: true }}
            exportName={`fee-statement-${flat.label}`}
            searchPlaceholder="Search charges…"
            empty="There are no charges for this flat yet."
            views={[
              { label: "Unpaid", params: { f_status: "unpaid" } },
              { label: "Extra levies", params: { f_type: "Extra levy (one-off)" } },
            ]}
          />
        </section>

        <section aria-labelledby="payments-h" className="flex flex-col gap-3">
          <h3 id="payments-h" className="text-xl font-bold">Payments received</h3>
          <p className="max-w-3xl text-muted">
            Payments the office has recorded for this flat. Each payment is used for the oldest unpaid charge first.
          </p>
          <DataTable
            id="p"
            rows={paymentRows}
            columns={paymentColumns}
            currency={cur}
            dateKey="paid_on"
            defaultSort={{ key: "paid_on", desc: true }}
            exportName={`payments-${flat.label}`}
            searchPlaceholder="Search payments…"
            empty="No payments have been recorded for this flat yet."
          />
        </section>

        {/* (c)–(e) Tenants */}
        <section aria-labelledby="tenants-h" className="no-print flex flex-col gap-4">
          <h3 id="tenants-h" className="text-xl font-bold">Tenants of flat {flat.label}</h3>

          <Card className="flex flex-col gap-3">
            <h4 className="text-lg font-bold">What your tenant can see in the app</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 font-bold text-ok">They can see</p>
                <ul className="flex flex-col gap-2">
                  {[
                    "Building information, house rules and documents for residents",
                    "Bin collection days",
                    "Community meetings",
                    "Problems they report, and the replies from the office",
                    "How to contact the office, and you as their landlord",
                  ].map((x) => (
                    <li key={x} className="flex items-start gap-2"><Check aria-hidden className="mt-1 size-5 shrink-0 text-ok" />{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 font-bold text-bad">They cannot see</p>
                <ul className="flex flex-col gap-2">
                  {[
                    "Your fees, payments or balance",
                    "The community's finances: invoices, contracts and accounts (only the simple summary on “Where the money goes”)",
                    "Other residents' private contact details",
                  ].map((x) => (
                    <li key={x} className="flex items-start gap-2"><X aria-hidden className="mt-1 size-5 shrink-0 text-bad" />{x}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-muted">Their access ends automatically after the end date. You can end it earlier at any time.</p>
          </Card>

          <DataTable
            id="t"
            rows={tenancyRows}
            columns={tenancyColumns}
            defaultSort={{ key: "start_date", desc: true }}
            exportName={`tenants-${flat.label}`}
            searchPlaceholder="Search tenants…"
            empty="No tenants have been added to this flat."
          />
          <p className="text-muted">
            <strong className="text-ink">Pending</strong> means the office has not approved the tenancy yet.{" "}
            <strong className="text-ink">Ended</strong> means the tenant no longer has access.
          </p>

          {current.length > 0 && (
            <div className="flex flex-col gap-4">
              <h4 className="text-lg font-bold">Change or end a current tenancy</h4>
              {current.map((t) => (
                <TenancyActions
                  key={t.id}
                  tenancy={t}
                  today={today}
                  changeAction={changeTenancyEndDate.bind(null, s.community.slug, t.id)}
                  endAction={endTenancy.bind(null, s.community.slug, t.id)}
                />
              ))}
            </div>
          )}

          <AddTenantForm
            key={flat.id}
            action={addTenant.bind(null, s.community.slug)}
            unitId={flat.id}
            unitLabel={flat.label}
            requiresApproval={requiresApproval}
            today={today}
          />
        </section>
      </section>
    </div>
  );
}
