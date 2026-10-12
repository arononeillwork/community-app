import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, KeyRound, ReceiptText, UserPlus, Users } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, humanize, money, todayInput } from "@/lib/format";
import { Avatar, Badge, Button, Card, Empty, Notice, PageHeader, SectionHeader, StatusBadge, TabLinks } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import DataTable, { type Column } from "@/components/DataTable";
import TenancyActions from "./TenancyActions";
import { TENANCY_LABELS } from "./tenancy";
import { changeEndDate, endTenancy } from "./actions";

export const metadata = { title: "My flat" };

type Unit = { id: string; label: string; floor: number | null; bedrooms: number | null; coefficient: number; building: { id: string; name: string } | null };
type Balance = { unit_id: string; overdue_cents: number; oldest_unpaid_due: string | null };
type Charge = { id: string; unit_id: string; period_label: string; due_date: string; amount_cents: number; paid_cents: number; status: string; levy_id: string | null };
type Payment = { id: string; unit_id: string; paid_on: string; amount_cents: number; method: string; reference: string | null };
type Tenancy = { id: string; unit_id: string; tenant_id: string; tenancy_type: string; start_date: string; end_date: string | null; status: string; note: string | null };
type TenantInfo = { tenancy_id: string; full_name: string; email: string | null; phone: string | null; preferred_method: string | null };

export default async function MyUnitsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ added?: string; invite?: string; flat?: string; ended?: string; statement?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const base = `/${s.community.slug}`;
  if (!s.isOwner) redirect(`${base}/home`);

  const supabase = await createClient();
  const c = s.community.id;
  const tz = s.community.timezone;
  const cur = s.community.currency;
  const today = todayInput(tz);

  const { data: owns } = await supabase.from("unit_ownerships")
    .select("unit:units!inner(id, label, floor, bedrooms, coefficient, building:buildings(id, name))")
    .eq("community_id", c).eq("owner_id", s.userId).or(`end_date.is.null,end_date.gte.${today}`);
  const units = ((owns ?? []).map((o) => o.unit as unknown as Unit))
    .sort((a, b) => a.label.localeCompare(b.label));
  const ids = units.map((u) => u.id);

  if (!units.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="My flat" />
        <Empty icon={KeyRound} title="No flat is linked to your account yet"
          action={<Button variant="secondary" href={`${base}/contacts`}>Contact the office</Button>}>
          If you own a flat in {s.community.name}, the office can link it to your account.
        </Empty>
      </div>
    );
  }

  // Filter by the owner's own flats explicitly: finance roles can read every flat's fees.
  const [{ data: balances }, { data: charges }, { data: payments }, { data: tenancies }, { data: tenantInfo }, { data: treasurer }] = await Promise.all([
    supabase.from("v_unit_balance").select("unit_id, overdue_cents, oldest_unpaid_due").in("unit_id", ids),
    supabase.from("fee_charges").select("id, unit_id, period_label, due_date, amount_cents, paid_cents, status, levy_id")
      .eq("community_id", c).in("unit_id", ids).order("due_date", { ascending: false }),
    supabase.from("fee_payments").select("id, unit_id, paid_on, amount_cents, method, reference")
      .eq("community_id", c).in("unit_id", ids).order("paid_on", { ascending: false }),
    supabase.from("tenancies").select("id, unit_id, tenant_id, tenancy_type, start_date, end_date, status, note")
      .eq("community_id", c).in("unit_id", ids).order("start_date", { ascending: false }),
    supabase.rpc("unit_tenants", { c }),
    supabase.from("key_contacts").select("name, phone, whatsapp, email").eq("community_id", c)
      .eq("contact_group", "committee").ilike("role_title", "treasurer%").limit(1).maybeSingle(),
  ]);

  const label = new Map(units.map((u) => [u.id, u.label]));
  const bal = new Map(((balances ?? []) as Balance[]).map((b) => [b.unit_id, b]));
  const allCharges = (charges ?? []) as Charge[];
  const allPayments = (payments ?? []) as Payment[];
  const people = new Map(((tenantInfo ?? []) as TenantInfo[]).map((t) => [t.tenancy_id, t]));
  const allTenancies = (tenancies ?? []) as Tenancy[];
  const multi = units.length > 1;
  const year = today.slice(0, 4);

  const overdue = units.map((u) => ({ u, b: bal.get(u.id) })).filter((x) => (x.b?.overdue_cents ?? 0) > 0);
  const nextCharge = (unitId: string) => allCharges
    .filter((ch) => ch.unit_id === unitId && ch.status !== "paid" && ch.due_date > today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const chargedThisYear = (unitId: string) => allCharges
    .filter((ch) => ch.unit_id === unitId && ch.due_date.startsWith(year)).reduce((sum, ch) => sum + Number(ch.amount_cents), 0);
  const paidThisYear = (unitId: string) => allPayments
    .filter((p) => p.unit_id === unitId && p.paid_on.startsWith(year)).reduce((sum, p) => sum + Number(p.amount_cents), 0);

  const statement = sp.statement === "payments" ? "payments" : "charges";
  const chargeRows = allCharges.map((ch) => ({
    id: ch.id, period: ch.period_label, flat: label.get(ch.unit_id) ?? "", due_date: ch.due_date,
    amount: Number(ch.amount_cents), paid: Number(ch.paid_cents),
    kind: ch.levy_id ? "Extra levy" : "Community fee",
    status: ch.status === "paid" ? "paid" : ch.due_date > today ? "upcoming" : ch.status === "partial" ? "partial" : "overdue",
  }));
  const paymentRows = allPayments.map((p) => ({
    id: p.id, paid_on: p.paid_on, flat: label.get(p.unit_id) ?? "", amount: Number(p.amount_cents),
    method: humanize(p.method), reference: p.reference ?? "",
  }));
  const chargeCols: Column[] = [
    { key: "period", header: "Period", primary: true, subKey: "kind" },
    ...(multi ? [{ key: "flat", header: "Flat", filter: true } as Column] : []),
    { key: "due_date", header: "Due", type: "date" },
    { key: "amount", header: "Amount", type: "money", total: true },
    { key: "paid", header: "Paid", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];
  const paymentCols: Column[] = [
    { key: "paid_on", header: "Date", type: "date", primary: true },
    ...(multi ? [{ key: "flat", header: "Flat", filter: true } as Column] : []),
    { key: "amount", header: "Amount", type: "money", total: true },
    { key: "method", header: "Method", filter: true },
    { key: "reference", header: "Reference", mobileHidden: true },
  ];

  const addedFlat = sp.flat && /^[\w-]{1,20}$/.test(sp.flat) ? sp.flat : "the flat";

  return (
    <>
      <PageHeader
        title={multi ? "My flats" : "My flat"}
        intro={multi ? "Your flats, community fees and tenants." : "Your flat, community fees and tenants."}
        actions={<Button href={`${base}/my-units/add-tenant`}><UserPlus aria-hidden className="size-4" /> Add a tenant</Button>}
      />

      <div className="flex flex-col gap-5">
        {sp.added && (
          <Notice tone="ok" title={`Tenant added to ${addedFlat}`}>
            {sp.added === "pending"
              ? "The office needs to approve this tenancy before they can sign in. "
              : "They can sign in now. "}
            {sp.invite === "sent" ? "We have emailed them an invitation." : "They already have an account, so they use their usual sign-in."}
          </Notice>
        )}
        {sp.ended === "failed" ? (
          <Notice tone="bad">That tenancy could not be changed. Please try again, or contact the office.</Notice>
        ) : sp.ended === "withdrawn" ? (
          <Notice tone="ok">The tenancy has been withdrawn.</Notice>
        ) : sp.ended ? (
          <Notice tone="ok">The tenancy has ended. Their access to the app stops today.</Notice>
        ) : null}

        {overdue.length > 0 && (
          <Notice tone="warn" title="Community fees overdue">
            <p>
              {overdue.map(({ u, b }, i) => (
                <span key={u.id}>
                  {i > 0 && " "}
                  <span className="font-medium">{money(b!.overdue_cents, cur)}</span> for {u.label}
                  {b!.oldest_unpaid_due ? <> has been due since {date(b!.oldest_unpaid_due)}.</> : " is due."}
                </span>
              ))}
              {" "}Please pay by bank transfer, or call the treasurer if this is not right.
            </p>
            {treasurer && (
              <ContactActions className="mt-3" variant="buttons" name={treasurer.name ?? "the treasurer"}
                phone={treasurer.phone} whatsapp={treasurer.whatsapp} email={treasurer.email} />
            )}
          </Notice>
        )}

        {units.map((u) => {
          const b = bal.get(u.id);
          const next = nextCharge(u.id);
          const unitTenancies = allTenancies.filter((t) => t.unit_id === u.id);
          const current = unitTenancies.filter((t) => t.status !== "ended");
          const past = unitTenancies.filter((t) => t.status === "ended");
          const due = b?.overdue_cents ?? 0;
          return (
            <Card key={u.id} padded={false}>
              <div className="@container flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text @2xs:grid">
                    <KeyRound aria-hidden className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.25rem] font-semibold leading-tight">Flat {u.label}</h2>
                    <p className="text-[0.9375rem] text-muted">
                      {[u.building?.name, u.floor != null ? `Floor ${u.floor}` : null, u.bedrooms ? `${u.bedrooms} bedrooms` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <Link href={`${base}/members/flat/${u.id}`} className="inline-flex items-center gap-1 text-[0.9375rem] font-medium no-underline hover:underline">
                  Who lives here <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>

              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-px border-y border-line bg-line">
                {[
                  { k: "Share of costs", v: `${Number(u.coefficient).toLocaleString("en-GB", { maximumFractionDigits: 2 })} %`, sub: "Participation share" },
                  { k: "Due now", v: money(due, cur), sub: due > 0 ? <Badge tone="bad">Overdue</Badge> : <Badge tone="ok">Up to date</Badge> },
                  { k: "Next charge", v: next ? money(next.amount_cents - next.paid_cents, cur) : "None", sub: next ? `Due ${date(next.due_date)}` : "Nothing scheduled" },
                  { k: `Paid in ${year}`, v: money(paidThisYear(u.id), cur), sub: `of ${money(chargedThisYear(u.id), cur)} for the year` },
                ].map((x) => (
                  <div key={x.k} className="bg-surface px-5 py-4 sm:px-6">
                    <dt className="text-sm text-muted">{x.k}</dt>
                    <dd className="mt-1 text-[1.25rem] font-semibold leading-tight tabular">{x.v}</dd>
                    <dd className="mt-1 text-sm text-muted">{x.sub}</dd>
                  </div>
                ))}
              </dl>

              <div className="@container p-5 sm:p-6">
                {/* Wraps instead of squeezing the title when the text is large. */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h3 className="flex items-center gap-3 text-[1.0625rem] font-semibold leading-snug">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                      <Users aria-hidden className="size-[1.15rem]" />
                    </span>
                    Tenants
                  </h3>
                  <Button variant="soft" size="sm" href={`${base}/my-units/add-tenant?unit=${u.id}`} aria-label={`Add a tenant to flat ${u.label}`}>
                    <UserPlus aria-hidden className="size-4" /> Add
                  </Button>
                </div>
                {current.length === 0 && (
                  <p className="text-[0.9375rem] text-muted">Nobody rents this flat. If you let it, add your tenant so they can use the app.</p>
                )}
                {current.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line">
                    {current.map((t) => {
                      const p = people.get(t.id);
                      const name = p?.full_name || "Tenant";
                      return (
                        <li key={t.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span className="hidden @2xs:block"><Avatar name={name} /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-medium text-ink">{name}</span>
                                <StatusBadge value={t.status} />
                              </div>
                              <p className="text-[0.9375rem] text-muted">
                                {TENANCY_LABELS[t.tenancy_type] ?? humanize(t.tenancy_type)} · {date(t.start_date)} – {t.end_date ? date(t.end_date) : "no end date"}
                              </p>
                              {(p?.phone || p?.email) && (
                                <p className="truncate text-[0.9375rem] text-ink-2">{[p.phone, p.email].filter(Boolean).join(" · ")}</p>
                              )}
                              {t.status === "pending" && <p className="mt-1 text-sm text-warn">Waiting for the office to approve. They cannot sign in yet.</p>}
                              {t.note && <p className="mt-1 text-sm text-muted">{t.note}</p>}
                            </div>
                            <ContactActions className="hidden sm:flex" name={name} phone={p?.phone} email={p?.email}
                              whatsapp={p?.preferred_method === "whatsapp" ? p?.phone : null} />
                          </div>
                          <div className="flex flex-col gap-2 sm:pl-[3.25rem]">
                            <ContactActions className="sm:hidden" variant="buttons" name={name} phone={p?.phone} email={p?.email}
                              whatsapp={p?.preferred_method === "whatsapp" ? p?.phone : null} />
                            <TenancyActions tenancyId={t.id} name={name} pending={t.status === "pending"} startDate={t.start_date}
                              endDate={t.end_date} today={today}
                              endAction={endTenancy.bind(null, s.community.slug, t.id)}
                              changeAction={changeEndDate.bind(null, s.community.slug, t.id)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {past.length > 0 && (
                  <details className="mt-4 rounded-xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
                    <summary className="cursor-pointer text-[0.9375rem] font-medium text-ink-2">Past tenants ({past.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {past.map((t) => (
                        <li key={t.id} className="text-[0.9375rem] text-muted">
                          <span className="text-ink-2">{people.get(t.id)?.full_name || "Tenant"}</span> · {TENANCY_LABELS[t.tenancy_type] ?? humanize(t.tenancy_type)} · {date(t.start_date)} – {date(t.end_date)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </Card>
          );
        })}

        <section aria-labelledby="statement" className="mt-3">
          <SectionHeader icon={ReceiptText} title={<span id="statement">Fee statement</span>}
            description="Your community fees and payments. Export gives you a copy for your records." />
          <TabLinks label="Statement" tabs={[
            { href: `${base}/my-units`, label: "Charges", active: statement === "charges", count: chargeRows.length },
            { href: `${base}/my-units?statement=payments`, label: "Payments", active: statement === "payments", count: paymentRows.length },
          ]} />
          {statement === "charges" ? (
            <DataTable id="c" rows={chargeRows} columns={chargeCols} currency={cur} defaultSort={{ key: "due_date", desc: true }}
              exportName="fee-charges" searchPlaceholder="Search charges…" empty="No charges yet. The treasurer adds them each quarter." />
          ) : (
            <DataTable id="p" rows={paymentRows} columns={paymentCols} currency={cur} defaultSort={{ key: "paid_on", desc: true }}
              exportName="fee-payments" searchPlaceholder="Search payments…" empty="No payments recorded yet. The treasurer records them when they arrive." />
          )}
        </section>
      </div>
    </>
  );
}
