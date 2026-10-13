import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import FinanceHeader from "@/components/finance/FinanceHeader";
import ScheduleForm from "./ScheduleForm";

export const metadata = { title: "Fee schedule" };

export default async function NewSchedulePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { community } = await params;
  const { year: yearParam } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/fees`;
  const thisYear = Number(todayInput(s.community.timezone).slice(0, 4));

  const [{ data: schedules }, { data: lines }, { count }] = await Promise.all([
    supabase.from("fee_schedules").select("year, frequency, method").eq("community_id", c).order("year", { ascending: false }),
    supabase.from("budget_lines").select("amount_cents, budget:budgets(year)").eq("community_id", c),
    supabase.from("units").select("id", { count: "exact", head: true }).eq("community_id", c),
  ]);
  const budgets: Record<string, number> = {};
  for (const l of lines ?? []) {
    const y = (l.budget as unknown as { year: number } | null)?.year;
    if (y) budgets[String(y)] = (budgets[String(y)] ?? 0) + Number(l.amount_cents);
  }
  const taken = new Set((schedules ?? []).map((x) => x.year));
  const asked = Number(yearParam);
  let year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear;
  while (taken.has(year)) year += 1;
  const prev = schedules?.[0] ?? null;

  return (
    <div className="max-w-2xl">
      <FinanceHeader title="New fee schedule" intro="How much owners pay in a year and how often." back={{ href: base, label: "Owner fees" }} />
      <ScheduleForm slug={s.community.slug} year={year} budgets={budgets} flats={count ?? 0}
        previous={prev ? { frequency: prev.frequency, method: prev.method } : null} cancelHref={base} />
    </div>
  );
}
