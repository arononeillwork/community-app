import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, Droplets, Phone, Users } from "lucide-react";
import { requireResident } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import { FlatGroupHeading, FlatRow } from "@/components/people/FlatRow";
import { PersonLine } from "@/components/people/PersonLine";
import { KEY_CONTACT_COLUMNS, KeyContactLine, type KeyContact } from "@/components/people/KeyContactLine";
import { loadPeople, titlesByPerson } from "@/components/people/data";
import { UUID_RE, badgesFor, doorOf, floorName, type DirRow, type UnitLite } from "@/components/people/types";

export const metadata = { title: "Flat" };

type Unit = UnitLite & { building: { id: string; name: string } | null };

export default async function FlatPage({ params }: { params: Promise<{ community: string; unitId: string }> }) {
  const { community, unitId } = await params;
  const s = await requireResident(community);
  if (!UUID_RE.test(unitId)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;

  const { data } = await supabase.from("units")
    .select("id, label, floor, bedrooms, building_id, building:buildings(id, name)")
    .eq("id", unitId).eq("community_id", c).maybeSingle();
  const unit = data as unknown as Unit | null;
  if (!unit) notFound();

  // Residents may open flats in their own block(s) only.
  if (!s.isAdmin) {
    const { data: mine } = await supabase.rpc("my_buildings", { c });
    if (!unit.building_id || !((mine ?? []) as string[]).includes(unit.building_id)) notFound();
  }

  const [{ rows, units, titles }, { data: contacts }, reports] = await Promise.all([
    loadPeople(supabase, c),
    supabase.from("key_contacts").select(KEY_CONTACT_COLUMNS).eq("community_id", c)
      .or(unit.building_id ? `building_id.eq.${unit.building_id},contact_group.eq.staff` : "contact_group.eq.staff")
      .order("sort"),
    s.isAdmin
      ? supabase.from("complaints").select("id, title, kind, status, priority, created_at")
          .eq("community_id", c).eq("target_unit_id", unit.id).in("status", ["new", "acknowledged", "in_progress"])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const held = titlesByPerson(titles);
  const blockRows = rows.filter((r) => r.building_id === unit.building_id);
  const badges: Record<string, string[]> = {};
  for (const r of blockRows) badges[r.profile_id] = badgesFor(held.get(r.profile_id) ?? [], r.roles, r.building_id);
  const peopleIn = (id: string) => blockRows.filter((r) => r.unit_id === id);

  // Who is here: tenants live in the flat; the owner is their landlord.
  const here = peopleIn(unit.id);
  const tenants = here.filter((p) => p.relation === "tenant");
  const owners = here.filter((p) => p.relation === "owner");
  const residents = tenants.length ? tenants : owners;

  // Neighbours: same door one floor up and down, and the other flats on this floor.
  const door = doorOf(unit.label);
  const sameBlock = units.filter((u) => u.building_id === unit.building_id && u.building_id && u.id !== unit.id);
  const byLabel = (a: UnitLite, b: UnitLite) => a.label.localeCompare(b.label, "en", { numeric: true });
  const stacked = (delta: number) => unit.floor == null || !door ? [] :
    sameBlock.filter((u) => u.floor === unit.floor! + delta && doorOf(u.label) === door).sort(byLabel);
  const above = stacked(1);
  const below = stacked(-1);
  const nextDoor = unit.floor == null ? [] : sameBlock.filter((u) => u.floor === unit.floor).sort(byLabel);
  const floors = sameBlock.map((u) => u.floor).filter((f): f is number => f != null);
  const topFloor = unit.floor != null && floors.every((f) => f <= unit.floor!);
  const bottomFloor = unit.floor != null && floors.every((f) => f >= unit.floor!);

  const allContacts = (contacts ?? []) as KeyContact[];
  const rep = allContacts.filter((k) => k.building_id && k.building_id === unit.building_id);
  const concierge = allContacts.find((k) => k.contact_group === "staff" && !k.building_id && /concierg/i.test(k.role_title))
    ?? allContacts.find((k) => k.contact_group === "staff" && !k.building_id);
  const helpers = [...rep, ...(concierge ? [concierge] : [])];
  const openReports = (reports.data ?? []) as { id: string; title: string; kind: string; status: string; priority: string; created_at: string }[];

  // Report dates in the community's own time zone, not the server's.
  const reportDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: s.community.timezone });

  const blockName = unit.building?.name ?? "No block";
  const facts = [
    unit.floor != null ? floorName(unit.floor) : null,
    unit.bedrooms != null ? `${unit.bedrooms} ${unit.bedrooms === 1 ? "bedroom" : "bedrooms"}` : null,
  ].filter(Boolean).join(" · ");

  const group = (label: string, Icon: typeof ArrowUp, list: UnitLite[], none: string) => (
    <section aria-label={label}>
      <FlatGroupHeading><Icon aria-hidden className="size-4" /> {label}</FlatGroupHeading>
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((u) => <FlatRow key={u.id} unit={u} people={peopleIn(u.id)} badges={badges} href={`${base}/members/flat/${u.id}`} />)}
        </ul>
      ) : (
        <p className="px-5 py-3.5 text-[0.9375rem] text-muted sm:px-6">{none}</p>
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        eyebrow={blockName}
        title={`Flat ${unit.label}`}
        intro={facts || undefined}
        back={{ href: unit.building_id ? `${base}/members?block=${unit.building_id}` : `${base}/members`, label: "Members" }}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <SectionHeader icon={Users} title="Who lives here" />
            {here.length === 0 ? (
              <p className="text-[0.9375rem] text-muted">No one is listed for this flat yet.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-5">
                  {residents.map((p: DirRow) => (
                    <PersonLine key={`${p.profile_id}-${p.relation}`} p={p} badges={badges[p.profile_id] ?? []} variant="detail" />
                  ))}
                </ul>
                {tenants.length > 0 && owners.length > 0 && (
                  <div className="mt-5 border-t border-line pt-5">
                    <h3 className="mb-3 text-sm font-medium text-muted">{owners.length === 1 ? "Owner" : "Owners"}</h3>
                    <ul className="flex flex-col gap-5">
                      {owners.map((p) => (
                        <PersonLine key={`${p.profile_id}-owner`} p={p} badges={badges[p.profile_id] ?? []} variant="detail" />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Droplets} title="Neighbours" description="For a leak or noise: the flats above, below and next door." />
            </div>
            {group("Above", ArrowUp, above, topFloor ? "Top floor, no flat above." : "No flat directly above.")}
            {group("Next door", ArrowLeftRight, nextDoor, "No other flats on this floor.")}
            {group("Below", ArrowDown, below, bottomFloor ? "Lowest floor, no flat below." : "No flat directly below.")}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {helpers.length > 0 && (
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                <SectionHeader icon={Phone} title="Who to call" description="Leaks, lifts and access" />
              </div>
              <ul className="divide-y divide-line">
                {helpers.map((k) => <KeyContactLine key={k.id} k={k} compact stacked className="px-5 py-3 sm:px-6" />)}
              </ul>
            </Card>
          )}

          {s.isAdmin && (
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                <SectionHeader icon={AlertTriangle} title="Open reports" description="Reports about this flat" />
              </div>
              {openReports.length === 0 ? (
                <p className="px-5 pb-5 text-[0.9375rem] text-muted sm:px-6 sm:pb-6">No open reports about this flat.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {openReports.map((r) => (
                    <li key={r.id}>
                      <Link href={`${base}/report/${r.id}`} className="block px-5 py-3 text-ink no-underline transition-colors hover:bg-surface-2 sm:px-6">
                        <div className="font-medium leading-snug">{r.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <StatusBadge value={r.status} />
                          {r.priority !== "normal" && <StatusBadge value={r.priority} />}
                          <time dateTime={r.created_at}>{reportDate.format(new Date(r.created_at))}</time>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
