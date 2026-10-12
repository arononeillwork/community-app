import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { addDays } from "@/components/finance-ops/dates";
import LevyForm from "./LevyForm";

export const metadata = { title: "New levy" };

export default async function NewLevyPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const { count } = await supabase.from("units").select("id", { count: "exact", head: true }).eq("community_id", s.community.id);
  const base = `/${s.community.slug}/finance/fees?tab=levies`;
  return (
    <div className="mx-auto max-w-2xl">
      <Toolbar title="New levy" description="A one-off contribution (derrama) for works approved at a meeting." back={{ href: base, label: "Levies" }} />
      <LevyForm slug={s.community.slug} flats={count ?? 0} defaultDue={addDays(todayInput(s.community.timezone), 30)} cancelHref={base} />
    </div>
  );
}
