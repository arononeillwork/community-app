import Link from "next/link";
import { Clock, UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { Avatar, Button, Card, Notice, PageHeader, SectionHeader } from "@/components/ui";
import SubmitButton from "@/components/admin/SubmitButton";
import PeopleTable, { type PersonRow } from "@/components/admin/PeopleTable";
import { ROLE_LABELS, ROLE_ORDER, TENANCY_TYPES, byLabel, dayInput } from "@/components/admin/format";
import { approveTenancy, declineTenancy } from "./actions";

export const metadata = { title: "People" };

type Membership = { profile_id: string; role: string; status: string; profile: { id: string; full_name: string; email: string | null; phone: string | null } | null };
type Flat = { id: string; label: string; building: { name: string } | null };
type Ownership = { owner_id: string; unit: Flat | null };
type Tenancy = {
  id: string; tenant_id: string; status: string; tenancy_type: string; start_date: string; end_date: string | null; note: string | null;
  unit: Flat | null; tenant: { full_name: string } | null; added: { full_name: string } | null;
};

const NOTICES: Record<string, { tone: "ok" | "info" | "bad"; text: string }> = {
  approved: { tone: "ok", text: "Tenancy approved. The tenant can now sign in." },
  declined: { tone: "info", text: "Tenancy declined. The landlord can add the tenant again if needed." },
  error: { tone: "bad", text: "That tenancy could not be updated. It may already have been approved or declined." },
};

export default async function PeoplePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ approved?: string; declined?: string; error?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;
  const today = dayInput(s.community.timezone);

  const [{ data: memberships }, { data: ownerships }, { data: tenancies }] = await Promise.all([
    supabase.from("memberships").select("profile_id, role, status, profile:profiles(id, full_name, email, phone)").eq("community_id", c),
    supabase.from("unit_ownerships").select("owner_id, unit:units(id, label, building:buildings(name))")
      .eq("community_id", c).or(`end_date.is.null,end_date.gte.${today}`),
    supabase.from("tenancies")
      .select("id, tenant_id, status, tenancy_type, start_date, end_date, note, unit:units(id, label, building:buildings(name)), tenant:profiles!tenancies_tenant_id_fkey(full_name), added:profiles!tenancies_added_by_fkey(full_name)")
      .eq("community_id", c).in("status", ["active", "pending"]).order("created_at"),
  ]);

  // One row per person: roles from memberships, flats from ownerships and tenancies.
  const people = new Map<string, { m: Membership[]; flats: Flat[] }>();
  for (const m of (memberships ?? []) as unknown as Membership[]) {
    if (!m.profile) continue;
    const p = people.get(m.profile_id) ?? { m: [], flats: [] };
    p.m.push(m);
    people.set(m.profile_id, p);
  }
  for (const o of (ownerships ?? []) as unknown as Ownership[]) if (o.unit) people.get(o.owner_id)?.flats.push(o.unit);
  const allTenancies = (tenancies ?? []) as unknown as Tenancy[];
  for (const t of allTenancies) if (t.unit && t.status === "active") people.get(t.tenant_id)?.flats.push(t.unit);

  const blockNames = new Set<string>();
  const rows: PersonRow[] = [...people.entries()].map(([id, p]) => {
    const profile = p.m[0].profile!;
    const active = p.m.filter((m) => m.status === "active");
    const status = active.length ? "active" : p.m.some((m) => m.status === "pending") ? "pending" : "ended";
    const shownRoles = (active.length ? active : p.m).map((m) => m.role);
    const roles = ROLE_ORDER.filter((r) => shownRoles.includes(r));
    const labels = [...new Set(p.flats.map((f) => f.label))].sort(byLabel);
    const blocks = [...new Set(p.flats.map((f) => f.building?.name).filter((b): b is string => !!b))];
    blocks.forEach((b) => blockNames.add(b));
    return {
      id, name: profile.full_name || profile.email || "Unnamed", email: profile.email, phone: profile.phone,
      roles: roles.map((r) => ROLE_LABELS[r]), flats: labels.join(", "), status, roleKeys: roles, blocks,
    };
  });

  const pending = allTenancies.filter((t) => t.status === "pending");
  const typeLabel = (v: string) => TENANCY_TYPES.find((x) => x.value === v)?.label ?? v;
  const notice = sp.approved ? NOTICES.approved : sp.declined ? NOTICES.declined : sp.error ? NOTICES.error : null;

  return (
    <>
      <PageHeader title="People" intro="Everyone in the community, their flats and how to reach them."
        actions={<Button href={`${base}/admin/people/invite`}><UserPlus aria-hidden className="size-4" /> Invite someone</Button>} />

      <div className="flex flex-col gap-6">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {pending.length > 0 && (
          <Card padded={false}>
            <div id="pending" className="scroll-mt-24 p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Clock} title="Tenancies waiting for approval"
                description={pending.length === 1 ? "A landlord has added a tenant." : `Landlords have added ${pending.length} tenants.`} />
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {pending.map((t) => (
                <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={t.tenant?.full_name} />
                    <div className="min-w-0">
                      <Link href={`${base}/admin/people/${t.tenant_id}`} className="font-medium no-underline hover:underline">
                        {t.tenant?.full_name || "New tenant"}
                      </Link>
                      <div className="text-[0.9375rem] text-ink-2">
                        Flat {t.unit?.label} · {typeLabel(t.tenancy_type)} · {date(t.start_date)}{t.end_date ? ` to ${date(t.end_date)}` : ", no end date"}
                      </div>
                      <div className="text-sm text-muted">Added by {t.added?.full_name ?? "the landlord"}{t.note ? ` · ${t.note}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 pl-[3.25rem] sm:pl-0">
                    <form action={approveTenancy.bind(null, s.community.slug, t.id)}>
                      <SubmitButton size="sm" pendingLabel="Approving…" aria-label={`Approve ${t.tenant?.full_name ?? "tenant"} for flat ${t.unit?.label}`}>Approve</SubmitButton>
                    </form>
                    <form action={declineTenancy.bind(null, s.community.slug, t.id)}>
                      <SubmitButton size="sm" variant="secondary" pendingLabel="Declining…" aria-label={`Decline ${t.tenant?.full_name ?? "tenant"} for flat ${t.unit?.label}`}>Decline</SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            {!s.community.settings?.tenant_requires_approval && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted sm:px-6">
                New tenants added by landlords now start straight away. <Link href={`${base}/admin/community#settings`}>Change this</Link>
              </p>
            )}
          </Card>
        )}

        <PeopleTable rows={rows} blocks={[...blockNames].sort(byLabel)} slug={s.community.slug} />
      </div>
    </>
  );
}
