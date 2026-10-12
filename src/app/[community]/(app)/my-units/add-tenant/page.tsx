import { redirect } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import AddTenantForm from "./AddTenantForm";
import { addTenant } from "../actions";

export const metadata = { title: "Add a tenant" };

type Unit = { id: string; label: string; building: { name: string } | null };

export default async function AddTenantPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { community } = await params;
  const { unit } = await searchParams;
  const s = await requireMember(community);
  const base = `/${s.community.slug}`;
  if (!s.isOwner) redirect(`${base}/home`);

  const supabase = await createClient();
  const today = todayInput(s.community.timezone);
  const { data: owns } = await supabase.from("unit_ownerships")
    .select("unit:units!inner(id, label, building:buildings(name))")
    .eq("community_id", s.community.id).eq("owner_id", s.userId).or(`end_date.is.null,end_date.gte.${today}`);
  const units = (owns ?? []).map((o) => o.unit as unknown as Unit).sort((a, b) => a.label.localeCompare(b.label));
  if (!units.length) redirect(`${base}/my-units`);

  const selected = units.find((u) => u.id === unit)?.id ?? units[0].id;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a tenant" back={{ href: `${base}/my-units`, label: units.length > 1 ? "My flats" : "My flat" }}
        intro="We email them an invitation to the app. Their access ends on the end date you choose." />
      <AddTenantForm
        action={addTenant.bind(null, s.community.slug)}
        units={units.map((u) => ({ id: u.id, label: u.label, building: u.building?.name ?? null }))}
        unitId={selected}
        today={today}
        needsApproval={!!s.community.settings?.tenant_requires_approval}
      />
    </div>
  );
}
