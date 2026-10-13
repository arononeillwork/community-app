import { notFound } from "next/navigation";
import clsx from "clsx";
import { BellRing, HandCoins, ListChecks, Trash2, Users, Wallet } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Avatar, Badge, Button, Card, Notice, SectionHeader, Stat, StatusBadge } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { ConfirmDialog } from "@/components/finance-ops/ConfirmDialog";
import { Flash } from "@/components/finance-ops/Flash";
import { methodLabel } from "@/components/finance-ops/dates";
import { peopleByUnit, type Person } from "@/components/finance-ops/people";
import { deletePayment, sendReminder } from "../actions";

export const metadata = { title: "Flat statement" };

type Charge = { id: string; period_label: string; due_date: string; amount_cents: number; paid_cents: number; status: string; levy_id: string | null };
type Payment = { id: string; paid_on: string; amount_cents: number; method: string; reference: string | null; unallocated_cents: number; created_at: string };
type Allocation = { payment_id: string; charge_id: string; amount_cents: number };

export default async function FlatStatementPage({ params, searchParams }: {
  params: Promise<{ community: string; unitId: string }>;
  searchParams: Promise<{ paid?: string; reminded?: string; removed?: string; error?: string; remind?: string }>;
}) {
  const { community, unitId } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}/finance/fees`;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);
  const year = today.slice(0, 4);

  const { data: unit } = await supabase.from("units").select("id, label, floor, coefficient, building:buildings(name)")
    .eq("community_id", c).eq("id", unitId).maybeSingle();
  if (!unit) notFound();

  const [{ data: chargeData }, { data: paymentData }, { data: reminders }, people] = await Promise.all([
    supabase.from("fee_charges").select("id, period_label, due_date, amount_cents, paid_cents, status, levy_id")
      .eq("community_id", c).eq("unit_id", unit.id).order("due_date", { ascending: false }),
    supabase.from("fee_payments").select("id, paid_on, amount_cents, method, reference, unallocated_cents, created_at")
      .eq("community_id", c).eq("unit_id", unit.id).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("fee_reminders").select("id, channel, sent_at, note").eq("community_id", c).eq("unit_id", unit.id).order("sent_at", { ascending: false }),
    peopleByUnit(supabase, c, [{ id: unit.id, label: unit.label }]),
  ]);
  const charges = (chargeData ?? []) as Charge[];
  const payments = (paymentData ?? []) as Payment[];
  const { data: allocData } = payments.length
    ? await supabase.from("payment_allocations").select("payment_id, charge_id, amount_cents").in("payment_id", payments.map((p) => p.id))
    : { data: [] };
  const allocations = (allocData ?? []) as Allocation[];
  const periodOf = new Map(charges.map((ch) => [ch.id, ch.period_label]));

  const owed = charges.filter((ch) => ch.due_date <= today).reduce((t, ch) => t + Number(ch.amount_cents) - Number(ch.paid_cents), 0);
  const upcoming = charges.filter((ch) => ch.due_date > today).reduce((t, ch) => t + Number(ch.amount_cents) - Number(ch.paid_cents), 0);
  const credit = payments.reduce((t, p) => t + Number(p.unallocated_cents), 0);
  const paidThisYear = payments.filter((p) => p.paid_on.startsWith(year)).reduce((t, p) => t + Number(p.amount_cents), 0);
  const oldest = charges.filter((ch) => ch.status !== "paid" && ch.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  const owners = people.owners.get(unit.id) ?? [];
  const tenants = people.tenants.get(unit.id) ?? [];
  const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: s.community.timezone }).format(new Date(iso));
  const building = (unit.building as unknown as { name: string } | null)?.name;

  // Result of a payment just recorded: which charges it paid.
  const justPaid = sp.paid ? payments.find((p) => p.id === sp.paid) : undefined;
  const paidParts = justPaid ? allocations.filter((a) => a.payment_id === justPaid.id).map((a) => {
    const ch = charges.find((x) => x.id === a.charge_id);
    const full = ch && Number(ch.paid_cents) >= Number(ch.amount_cents);
    return `${periodOf.get(a.charge_id) ?? "a charge"} (${money(a.amount_cents, cur)}${full ? ", now paid" : ""})`;
  }) : [];

  const reminder = owed > 0 && (
    <ConfirmDialog
      label="Send reminder"
      icon={<BellRing aria-hidden className="size-4" />}
      confirmVariant="primary"
      defaultOpen={sp.remind === "1"}
      title={`Remind the owner of flat ${unit.label}?`}
      description={`${owners.map((o) => o.name).join(", ") || "The owner"} will get a message in the app: ${money(owed, cur)} outstanding since ${date(oldest?.due_date)}.`}
      confirmLabel="Send reminder"
      pendingLabel="Sending…"
      action={sendReminder.bind(null, slug, unit.id)}
    >
      <div className="field">
        <label htmlFor="note">Personal note <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="note" name="note" maxLength={500} className="input min-h-20" placeholder={`e.g. Please use the reference CUOTA ${unit.label}.`} />
      </div>
    </ConfirmDialog>
  );

  return (
    <>
      <FinanceHeader
        back={{ href: base, label: "Owner fees" }}
        title={`Flat ${unit.label}`}
        badge={owed > 0 ? <Badge tone="bad">In arrears</Badge> : <Badge tone="ok">Up to date</Badge>}
        intro={[building, unit.floor != null ? `floor ${unit.floor}` : null, `${Number(unit.coefficient).toFixed(2)}% share`].filter(Boolean).join(" · ")}
        actions={<>{reminder}<Button href={`${base}/payments/new?unit=${unit.id}`}><HandCoins aria-hidden className="size-4" /> Record payment</Button></>}
      />
      <div className="flex flex-col gap-5">
        {(justPaid || sp.reminded != null || sp.removed || sp.error) && (
        <Flash>
        {justPaid && (
          <Notice tone="ok" title={`Payment of ${money(justPaid.amount_cents, cur)} recorded`}>
            {paidParts.length ? `It went to ${paidParts.join(", ")}.` : "There were no open charges."}
            {Number(justPaid.unallocated_cents) > 0 && ` ${money(justPaid.unallocated_cents, cur)} is kept as credit for future charges.`}
          </Notice>
        )}
        {sp.reminded != null && (
          Number(sp.reminded) > 0
            ? <Notice tone="ok">Reminder sent to {sp.reminded === "1" ? "the owner" : `${sp.reminded} owners`}. They will see it in the app under alerts.</Notice>
            : <Notice tone="warn">Reminder logged, but no owner of this flat has an active account. Please contact them another way.</Notice>
        )}
        {sp.removed && <Notice tone="ok">Payment removed. The charges it paid are open again.</Notice>}
        {sp.error && (
          <Notice tone="bad">
            {sp.error === "remind" ? "The reminder could not be sent. Check that the flat still has something overdue, then try again."
              : sp.error === "delete" ? "The payment could not be removed. Please try again."
              : "That did not work. Please try again."}
          </Notice>
        )}
        </Flash>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Owed now" value={money(owed, cur)} tone={owed > 0 ? "bad" : undefined} sub={oldest ? `Since ${oldest.period_label}` : "Nothing overdue"} />
          <Stat label="Not due yet" value={money(upcoming, cur)} sub={charges.find((ch) => ch.due_date > today && ch.status !== "paid") ? `Next: ${date(charges.filter((ch) => ch.due_date > today && ch.status !== "paid").at(-1)?.due_date)}` : "No upcoming charges"} />
          <Stat label={`Paid in ${year}`} value={money(paidThisYear, cur)} sub={`${payments.filter((p) => p.paid_on.startsWith(year)).length} payments`} />
          <Stat label="Credit" value={money(credit, cur)} tone={credit > 0 ? "ok" : undefined} sub={credit > 0 ? "Overpaid, kept for later" : "No credit"} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1"><SectionHeader icon={ListChecks} title="Charges" description={charges.length ? undefined : "No charges for this flat yet."} /></div>
              {charges.length > 0 && (
                <>
                  <div className="hidden items-center gap-3 border-y border-line bg-surface-2 px-6 py-2 text-[0.8125rem] font-medium text-muted md:flex">
                    <span className="flex-1">Period</span><span className="w-24 text-right">Amount</span><span className="w-24 text-right">Paid</span><span className="w-28 text-right">Status</span>
                  </div>
                  <ul className="divide-y divide-line border-t border-line md:border-t-0">
                    {charges.map((ch) => {
                      const late = ch.status !== "paid" && ch.due_date <= today;
                      const notDue = ch.status === "unpaid" && ch.due_date > today;
                      return (
                        <li key={ch.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{ch.period_label}{ch.levy_id && <span className="ml-2 text-sm font-normal text-muted">Levy</span>}</div>
                            <div className="text-sm text-muted">Due {date(ch.due_date)}</div>
                          </div>
                          <div className="tabular hidden w-24 text-right text-[0.9375rem] text-ink md:block">{money(ch.amount_cents, cur)}</div>
                          <div className="tabular hidden w-24 text-right text-[0.9375rem] text-ink-2 md:block">{money(ch.paid_cents, cur)}</div>
                          <div className="flex flex-col items-end gap-1 md:w-28">
                            <span className="tabular text-[0.9375rem] md:hidden">{money(ch.amount_cents, cur)}</span>
                            {notDue ? <Badge tone="neutral">Not due yet</Badge> : <StatusBadge value={late ? "overdue" : ch.status} />}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>

            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1"><SectionHeader icon={Wallet} title="Payments" description={payments.length ? undefined : "No payments recorded for this flat yet."} /></div>
              {payments.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {payments.map((p) => {
                    const parts = allocations.filter((a) => a.payment_id === p.id);
                    return (
                      <li key={p.id} className={clsx("flex items-start gap-3 px-5 py-3 sm:px-6", p.id === sp.paid && "bg-ok-soft/50")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="tabular font-medium">{money(p.amount_cents, cur)}</span>
                            <span className="text-sm text-muted">{date(p.paid_on)} · {methodLabel(p.method)}</span>
                          </div>
                          {p.reference && <div className="truncate text-sm text-muted">Ref. {p.reference}</div>}
                          <div className="text-sm text-ink-2">
                            {parts.length ? `Paid ${parts.map((a) => `${periodOf.get(a.charge_id) ?? "charge"}${parts.length > 1 ? ` (${money(a.amount_cents, cur)})` : ""}`).join(", ")}` : "Not allocated"}
                            {Number(p.unallocated_cents) > 0 && <span className="text-ok"> · {money(p.unallocated_cents, cur)} credit</span>}
                          </div>
                        </div>
                        <ConfirmDialog
                          label="Remove"
                          ariaLabel={`Remove the payment of ${money(p.amount_cents, cur)} received on ${date(p.paid_on)}`}
                          icon={<Trash2 aria-hidden className="size-4" />}
                          size="sm"
                          variant="ghost"
                          title="Remove this payment?"
                          description={`${money(p.amount_cents, cur)} received on ${date(p.paid_on)}. Use this only for a payment recorded by mistake: the charges it paid become unpaid again.`}
                          confirmLabel="Remove payment"
                          pendingLabel="Removing…"
                          action={deletePayment.bind(null, slug, unit.id, p.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1"><SectionHeader icon={Users} title="People" /></div>
              <ul className="divide-y divide-line border-t border-line">
                {[...owners.map((p) => ({ p, role: "Owner" })), ...tenants.map((p) => ({ p, role: "Tenant" }))].map(({ p, role }: { p: Person; role: string }) => (
                  <li key={`${role}-${p.id}`} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                    <Avatar name={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug [overflow-wrap:anywhere]">{p.name}</div>
                      <div className="text-sm text-muted">{role}{role === "Tenant" ? " · no fee access" : ""}</div>
                      <ContactActions className="mt-2 -ml-1" name={p.name} phone={p.phone} email={p.email} whatsapp={p.preferred === "whatsapp" ? p.phone : null} />
                    </div>
                  </li>
                ))}
                {owners.length + tenants.length === 0 && <li className="px-5 py-3 text-[0.9375rem] text-muted sm:px-6">No owner on record.</li>}
              </ul>
              {owners.some((o) => !o.phone && !o.email) && (
                <p className="border-t border-line px-5 py-3 text-sm text-muted sm:px-6">Some owners only share their details with the administrator.</p>
              )}
            </Card>

            <Card>
              <SectionHeader icon={BellRing} title="Reminders" description={(reminders ?? []).length ? undefined : "No reminders sent."} />
              {(reminders ?? []).length > 0 && (
                <ol className="flex flex-col gap-3">
                  {(reminders ?? []).map((r) => (
                    <li key={r.id} className="text-[0.9375rem]">
                      <div className="text-ink">{when(r.sent_at)}</div>
                      <div className="text-sm text-muted">{r.channel === "in_app" ? "In the app" : r.channel === "whatsapp" ? "WhatsApp" : r.channel === "email" ? "Email" : r.channel}{r.note ? ` · ${r.note}` : ""}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
