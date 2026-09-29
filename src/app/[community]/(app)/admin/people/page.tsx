import Link from "next/link";
import clsx from "clsx";
import { Check, X } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, todayInput } from "@/lib/format";
import { Card, Empty, Notice, PageHeader, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import AdminNav from "@/components/admin/AdminNav";
import AddPersonForm from "@/components/admin/AddPersonForm";
import ActionButton from "@/components/admin/ActionButton";
import ConfirmAction from "@/components/admin/ConfirmAction";
import { ROLES, ROLE_LABELS, ROLE_PLURALS, doneMessage, isRole, tenancyTypeLabel, type AdminRole } from "@/components/admin/labels";
import { addPerson, approveTenancy, declineTenancy } from "./actions";

export const metadata = { title: "People & flats" };

type Name = { full_name: string | null; email: string | null; phone?: string | null } | null;
type Person = { id: string; name: string; email: string; phone: string; roles: { role: AdminRole; status: string }[] };

const STATUS_RANK: Record<string, number> = { active: 0, pending: 1, ended: 2 };

function nameOf(p: Name, fallback = "Unknown person") {
  return p?.full_name || p?.email || fallback;
}

export default async function PeoplePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ role?: string; done?: string }>;
}) {
  const { community } = await params;
  const { role: roleParam, done } = await searchParams;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const cid = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}`;
  const today = todayInput(s.community.timezone);
  const roleFilter: AdminRole | "" = isRole(roleParam) ? roleParam : "";

  const [memRes, ownRes, tenRes, unitRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, profile_id, role, status, profile:profiles(full_name, email, phone)")
      .eq("community_id", cid),
    supabase
      .from("unit_ownerships")
      .select("id, unit_id, owner_id, owner:profiles!unit_ownerships_owner_id_fkey(full_name, email)")
      .eq("community_id", cid)
      .or(`end_date.is.null,end_date.gte.${today}`),
    supabase
      .from("tenancies")
      .select("id, unit_id, tenant_id, status, tenancy_type, start_date, end_date, note, created_at, tenant:profiles!tenancies_tenant_id_fkey(full_name, email, phone), adder:profiles!tenancies_added_by_fkey(full_name, email)")
      .eq("community_id", cid)
      .in("status", ["active", "pending"])
      .order("created_at"),
    supabase
      .from("units")
      .select("id, label, floor, bedrooms, coefficient, building:buildings(name, sort)")
      .eq("community_id", cid)
      .order("label"),
  ]);
  const loadFailed = !!(memRes.error || ownRes.error || tenRes.error || unitRes.error);

  // ---- Flats ----
  const units = (unitRes.data ?? []).map((u) => {
    const b = u.building as unknown as { name: string; sort: number } | null;
    return {
      id: String(u.id), label: String(u.label), block: b?.name ?? "", blockSort: b?.sort ?? 999,
      floor: u.floor == null ? null : Number(u.floor), bedrooms: u.bedrooms == null ? null : Number(u.bedrooms),
      share: u.coefficient == null ? null : Number(u.coefficient),
    };
  });
  const unitLabel = new Map(units.map((u) => [u.id, u.label]));

  // ---- Ownerships + tenancies ----
  const ownerships = (ownRes.data ?? []).map((o) => ({
    unitId: String(o.unit_id), ownerId: String(o.owner_id), name: nameOf(o.owner as unknown as Name, "Owner (details hidden)"),
  }));
  const tenancies = (tenRes.data ?? []).map((t) => {
    const tenant = t.tenant as unknown as Name;
    const adder = t.adder as unknown as Name;
    return {
      id: String(t.id), unitId: String(t.unit_id), tenantId: String(t.tenant_id), status: String(t.status),
      type: String(t.tenancy_type ?? "other"), start: String(t.start_date ?? ""), end: t.end_date ? String(t.end_date) : null,
      note: t.note ? String(t.note) : "", name: nameOf(tenant, "Tenant"), email: tenant?.email ?? "", phone: tenant?.phone ?? "",
      addedBy: adder ? nameOf(adder) : "",
    };
  });
  const pending = tenancies.filter((t) => t.status === "pending");
  const current = tenancies.filter((t) => t.status === "active");

  // ---- People (one row per person; memberships are one row per role) ----
  const people = new Map<string, Person>();
  for (const m of memRes.data ?? []) {
    if (!isRole(m.role)) continue;
    const pid = String(m.profile_id);
    const prof = m.profile as unknown as Name;
    const p = people.get(pid) ?? { id: pid, name: nameOf(prof), email: prof?.email ?? "", phone: prof?.phone ?? "", roles: [] };
    p.roles.push({ role: m.role, status: String(m.status) });
    people.set(pid, p);
  }

  const flatsOf = (pid: string) => {
    const owned = ownerships.filter((o) => o.ownerId === pid).map((o) => `${unitLabel.get(o.unitId) ?? "?"} (owner)`).sort();
    const rented = tenancies.filter((t) => t.tenantId === pid)
      .map((t) => `${unitLabel.get(t.unitId) ?? "?"} (tenant${t.status === "pending" ? ", waiting" : ""})`).sort();
    return [...owned, ...rented].join(", ");
  };

  const allPeople = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries(ROLES.map((r) => [r, allPeople.filter((p) => p.roles.some((x) => x.role === r)).length])) as Record<AdminRole, number>;
  const shown = roleFilter ? allPeople.filter((p) => p.roles.some((x) => x.role === roleFilter)) : allPeople;

  const memberRows = shown.map((p) => {
    const roles = [...p.roles].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
    const best = roles.reduce((acc, r) => (STATUS_RANK[r.status] ?? 3) < (STATUS_RANK[acc] ?? 3) ? r.status : acc, "ended");
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      roles: roles.map((r) => ROLE_LABELS[r.role] + (r.status === "active" ? "" : r.status === "pending" ? " (waiting)" : " (ended)")),
      flats: flatsOf(p.id),
      status: best,
    };
  });

  const memberColumns: Column[] = [
    { key: "name", header: "Name", href: `${base}/admin/people/{id}`, primary: true },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone", mobileHidden: true },
    { key: "roles", header: "Roles", type: "tags" },
    { key: "flats", header: "Flats" },
    { key: "status", header: "Membership", type: "status", filter: true },
  ];

  const unitRows = [...units]
    .sort((a, b) => a.blockSort - b.blockSort || a.label.localeCompare(b.label))
    .map((u) => ({
      id: u.id,
      label: u.label,
      block: u.block,
      floor: u.floor,
      bedrooms: u.bedrooms,
      share: u.share,
      owners: ownerships.filter((o) => o.unitId === u.id).map((o) => o.name).sort().join(", "),
      tenants: current.filter((t) => t.unitId === u.id).map((t) => t.name).sort().join(", "),
    }));

  const unitColumns: Column[] = [
    { key: "label", header: "Flat", primary: true },
    { key: "block", header: "Block", filter: true },
    { key: "floor", header: "Floor", type: "number" },
    { key: "bedrooms", header: "Bedrooms", type: "number", filter: true },
    { key: "share", header: "Share %", type: "percent", total: true },
    { key: "owners", header: "Owner(s)" },
    { key: "tenants", header: "Current tenant(s)" },
  ];

  const pills: { value: AdminRole | ""; label: string }[] = [
    { value: "", label: `Everyone (${allPeople.length})` },
    ...ROLES.map((r) => ({ value: r, label: `${ROLE_PLURALS[r]} (${counts[r]})` })),
  ];
  const needsApproval = !!s.community.settings?.tenant_requires_approval;
  const doneText = doneMessage(done);

  return (
    <>
      <AdminNav slug={slug} />
      <PageHeader
        title="People & flats"
        intro="Everyone who can use the app, the flats they own or rent, and tenants waiting for your approval."
      />

      <div className="flex flex-col gap-10">
        {loadFailed && <Notice tone="warn">Some information could not be loaded just now. Please refresh the page in a moment.</Notice>}

        {/* ---- Waiting for approval ---- */}
        <section id="pending" aria-labelledby="pending-title" className="flex scroll-mt-32 flex-col gap-4">
          <div>
            <h2 id="pending-title" className="text-2xl font-bold">Tenancies waiting for approval</h2>
            <p className="text-muted">
              {needsApproval
                ? "When a landlord adds a tenant, the tenant can only use the app after you approve them. "
                : "Tenants added by landlords are currently allowed in straight away. "}
              <Link href={`${base}/admin/settings`} className="font-bold text-brand underline">Change this in Community settings</Link>.
            </p>
          </div>
          {doneText && <Notice tone="ok">{doneText}</Notice>}
          {pending.length === 0 ? (
            <Empty title="No one is waiting for approval." />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {pending.map((t) => (
                <li key={t.id}>
                  <Card as="article" className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-bold">{t.name} – flat {unitLabel.get(t.unitId) ?? "?"}</h3>
                      <StatusBadge value="pending" />
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      {t.email && (<><dt className="text-muted">Email</dt><dd className="break-all">{t.email}</dd></>)}
                      {t.phone && (<><dt className="text-muted">Phone</dt><dd>{t.phone}</dd></>)}
                      <dt className="text-muted">Type</dt><dd>{tenancyTypeLabel(t.type)}</dd>
                      <dt className="text-muted">From</dt><dd>{date(t.start)}</dd>
                      <dt className="text-muted">Until</dt><dd>{t.end ? date(t.end) : "No end date"}</dd>
                      {t.addedBy && (<><dt className="text-muted">Added by</dt><dd>{t.addedBy}</dd></>)}
                      {t.note && (<><dt className="text-muted">Note</dt><dd className="whitespace-pre-line">{t.note}</dd></>)}
                    </dl>
                    <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-start">
                      <ActionButton action={approveTenancy.bind(null, slug, t.id)} label="Approve" pendingLabel="Approving…"
                        icon={<Check aria-hidden className="size-5" />} />
                      <ConfirmAction
                        action={declineTenancy.bind(null, slug, t.id)}
                        label="Decline"
                        icon={<X aria-hidden className="size-5" />}
                        question={`Decline ${t.name} as tenant of flat ${unitLabel.get(t.unitId) ?? ""}? They will not be able to use the app.`}
                        confirmLabel="Yes, decline this tenancy"
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Members ---- */}
        <section aria-labelledby="members-title" className="flex flex-col gap-4">
          <div>
            <h2 id="members-title" className="text-2xl font-bold">Members</h2>
            <p className="text-muted">Tap a name to change their role or flats, or to remove them.</p>
          </div>
          <nav aria-label="Show people by role" className="no-print flex flex-wrap gap-2">
            {pills.map((p) => {
              const on = roleFilter === p.value;
              return (
                <Link key={p.value || "all"} href={p.value ? `${base}/admin/people?role=${p.value}` : `${base}/admin/people`}
                  scroll={false} aria-current={on ? "page" : undefined}
                  className={clsx("inline-flex min-h-12 items-center rounded-full border-2 px-4 font-bold no-underline",
                    on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand")}>
                  {p.label}
                </Link>
              );
            })}
          </nav>
          <DataTable
            id="members"
            rows={memberRows}
            columns={memberColumns}
            defaultSort={{ key: "name" }}
            exportName={roleFilter ? `members-${roleFilter}` : "members"}
            searchPlaceholder="Search by name, email, phone or flat…"
            empty={roleFilter ? `No ${ROLE_PLURALS[roleFilter].toLowerCase()} yet.` : "No members yet."}
            views={[
              { label: "Active", params: { f_status: "active" } },
              { label: "Waiting", params: { f_status: "pending" } },
              { label: "Ended", params: { f_status: "ended" } },
            ]}
          />
        </section>

        {/* ---- Add a person ---- */}
        <section aria-labelledby="add-title">
          <Card className="flex flex-col gap-4">
            <div>
              <h2 id="add-title" className="text-2xl font-bold">Add a person</h2>
              <p className="text-muted">
                Owners and tenants are linked to a flat. If the email address is new, we send an invitation email so they can sign in.
              </p>
            </div>
            <AddPersonForm action={addPerson.bind(null, slug)} units={units.map((u) => ({ id: u.id, label: u.label }))} today={today} />
          </Card>
        </section>

        {/* ---- Flats ---- */}
        <section aria-labelledby="units-title" className="flex flex-col gap-4">
          <div>
            <h2 id="units-title" className="text-2xl font-bold">Flats</h2>
            <p className="text-muted">
              <strong>Share %</strong> is each flat&apos;s part of the shared community costs (sometimes called the participation
              coefficient). All flats together should add up to about 100 %.
            </p>
          </div>
          <DataTable
            id="units"
            rows={unitRows}
            columns={unitColumns}
            exportName="flats"
            searchPlaceholder="Search by flat, owner or tenant…"
            empty="No flats have been set up yet."
          />
        </section>
      </div>
    </>
  );
}
