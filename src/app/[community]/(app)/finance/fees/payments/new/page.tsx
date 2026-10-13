import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { peopleByUnit } from "@/components/finance-ops/people";
import PaymentForm, { type FlatOption } from "./PaymentForm";

export const metadata = { title: "Record a payment" };

export default async function NewPaymentPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { community } = await params;
  const { unit } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/fees`;
  const today = todayInput(s.community.timezone);

  const [{ data: balances }, { data: open }] = await Promise.all([
    supabase.from("v_unit_balance").select("unit_id, label, building_name, overdue_cents").eq("community_id", c).order("label"),
    supabase.from("fee_charges").select("unit_id, period_label, due_date").eq("community_id", c).neq("status", "paid").lte("due_date", today).order("due_date"),
  ]);
  const rows = balances ?? [];
  const { owners } = await peopleByUnit(supabase, c, rows.map((b) => ({ id: b.unit_id, label: b.label })));
  const firstOpen = new Map<string, string>();
  for (const ch of open ?? []) if (!firstOpen.has(ch.unit_id)) firstOpen.set(ch.unit_id, ch.period_label);

  const flats: FlatOption[] = rows.map((b) => ({
    id: b.unit_id, label: b.label, block: b.building_name ?? "Other",
    owners: (owners.get(b.unit_id) ?? []).map((p) => p.name).join(", "),
    owed: Number(b.overdue_cents), since: firstOpen.get(b.unit_id) ?? null,
  }));
  const selected = flats.some((f) => f.id === unit) ? unit! : "";
  const back = selected ? { href: `${base}/${selected}`, label: `Flat ${flats.find((f) => f.id === selected)?.label}` } : { href: base, label: "Owner fees" };

  return (
    <div className="max-w-2xl">
      <FinanceHeader title="Record a payment" intro="Money received from an owner for community fees." back={back} />
      <PaymentForm slug={s.community.slug} flats={flats} unitId={selected} today={today} cancelHref={back.href} />
    </div>
  );
}
