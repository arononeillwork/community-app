import { Building2, DoorOpen, KeyRound, UserRound, Users } from "lucide-react";
import type { Session } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, PageHeader, SectionHeader, Stat, TabLinks } from "@/components/ui";
import { ContactActions, telHref } from "@/components/contact";
import DataTable, { type Column } from "@/components/DataTable";
import BlockDirectory from "@/components/people/BlockDirectory";
import MemberFinder, { type FinderItem } from "@/components/people/MemberFinder";
import { KEY_CONTACT_COLUMNS, KeyContactLine, type KeyContact } from "@/components/people/KeyContactLine";
import { loadPeople, titlesByPerson } from "@/components/people/data";
import { METHOD_SHORT, TENANCY_LABELS, badgesFor, floorName, type DirRow } from "@/components/people/types";

const ROLE_NAMES: Record<string, string> = { admin: "Administrator", treasurer: "Treasurer", owner: "Owner", tenant: "Tenant" };

type Membership = { profile_id: string; role: string; profile: { full_name: string; email: string | null; phone: string | null } | null };

const byLabel = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Administrators: a search across every block, every block floor by floor, and a list of everyone (one row per person). */
export default async function AdminMembers({ s, view, blockId }: { s: Session; view: "blocks" | "list"; blockId?: string }) {
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;
  const { rows, blocks, units, titles } = await loadPeople(supabase, c);
  // Open on the administrator's own block if they live here, otherwise the first block.
  const ownBlock = rows.find((r) => r.is_me)?.building_id;
  const active = blocks.find((b) => b.building_id === blockId) ?? blocks.find((b) => b.building_id === ownBlock) ?? blocks[0];

  const [{ data: memberships }, { data: reps }] = await Promise.all([
    supabase.from("memberships").select("profile_id, role, profile:profiles(full_name, email, phone)")
      .eq("community_id", c).eq("status", "active"),
    active
      ? supabase.from("key_contacts").select(KEY_CONTACT_COLUMNS).eq("community_id", c).eq("building_id", active.building_id).order("sort")
      : Promise.resolve({ data: [] as KeyContact[] }),
  ]);

  const held = titlesByPerson(titles);
  const inFlats = new Set(rows.map((r) => r.profile_id));

  // Active members with no flat (the office, a new resident not yet linked).
  const loose = new Map<string, { id: string; name: string; email: string | null; phone: string | null; roles: string[] }>();
  for (const m of (memberships ?? []) as unknown as Membership[]) {
    if (inFlats.has(m.profile_id) || !m.profile) continue;
    const cur = loose.get(m.profile_id) ?? { id: m.profile_id, name: m.profile.full_name || "Unnamed member", email: m.profile.email, phone: m.profile.phone, roles: [] };
    cur.roles.push(m.role);
    loose.set(m.profile_id, cur);
  }
  const notLinked = [...loose.values()].sort((a, b) => a.name.localeCompare(b.name));

  const everyone = inFlats.size + notLinked.length;

  // One row per person with all their flats, so the list, the "Everyone" tab and the People number agree.
  const byPerson = new Map<string, DirRow[]>();
  for (const r of rows) byPerson.set(r.profile_id, [...(byPerson.get(r.profile_id) ?? []), r]);
  const listRows = [
    ...[...byPerson.values()].map((flats) => {
      const p = flats[0];
      const labels = [...new Set(flats.map((f) => f.unit_label))].sort(byLabel);
      const relations = new Set(flats.map((f) => f.relation));
      const tenancy = [...new Set(flats.map((f) => f.tenancy_type).filter((t): t is string => !!t))].map((t) => TENANCY_LABELS[t] ?? "Other");
      const badges = [...new Set(flats.flatMap((f) => badgesFor(held.get(p.profile_id) ?? [], p.roles, f.building_id)))];
      return {
        id: p.profile_id,
        name: p.full_name,
        // One flat: straight to it (neighbours and all). Several: the person's page, which links each flat.
        link: labels.length === 1 ? `${base}/members/flat/${p.unit_id}` : `${base}/admin/people/${p.profile_id}`,
        titles: badges.join(" · "),
        flat: labels.join(", "),
        block: [...new Set(flats.map((f) => f.building_name))].sort(byLabel).join(", "),
        relation: relations.size > 1 ? "Owner and tenant" : relations.has("owner") ? "Owner" : "Tenant",
        tenancy: tenancy.join(", "),
        phone: p.phone,
        tel: p.phone ? telHref(p.phone) : null,
        email: p.email,
        method: p.preferred_method ? METHOD_SHORT[p.preferred_method] : null,
      };
    }),
    ...notLinked.map((m) => ({
      id: m.id,
      name: m.name,
      link: `${base}/admin/people/${m.id}`,
      titles: m.roles.map((r) => ROLE_NAMES[r] ?? r).join(" · "),
      flat: "",
      block: "",
      relation: "No flat",
      tenancy: "",
      phone: m.phone,
      tel: m.phone ? telHref(m.phone) : null,
      email: m.email,
      method: null,
    })),
  ];

  // Everything the cross-block finder can jump to: every flat, and members without one.
  const finder: FinderItem[] = [
    ...units.map((u) => {
      const block = blocks.find((b) => b.building_id === u.building_id)?.building_name ?? "No block";
      return {
        href: `${base}/members/flat/${u.id}`,
        kind: "flat" as const,
        title: u.label,
        where: `${block} · ${floorName(u.floor)}`,
        people: rows.filter((r) => r.unit_id === u.id).map((r) => ({
          name: r.full_name, relation: r.relation === "owner" ? "owner" : "tenant", digits: (r.phone ?? "").replace(/\D/g, ""),
        })),
      };
    }),
    ...notLinked.map((m) => ({
      href: `${base}/admin/people/${m.id}`,
      kind: "person" as const,
      title: m.name,
      where: [...m.roles.map((r) => ROLE_NAMES[r] ?? r), "no flat"].join(" · "),
      people: [{ name: m.name, relation: "no flat", digits: (m.phone ?? "").replace(/\D/g, "") }],
    })),
  ];

  const rentedFlats = new Set(rows.filter((r) => r.relation === "tenant").map((r) => r.unit_id)).size;
  // "Everyone" comes first so it stays visible on phones, where the tab row scrolls.
  const tabs = [
    { href: `${base}/members?view=list`, label: "Everyone", count: everyone, active: view === "list" },
    ...blocks.map((b) => ({
      href: `${base}/members?block=${b.building_id}`, label: b.building_name, count: b.people,
      active: view === "blocks" && b.building_id === active?.building_id,
    })),
  ];

  const notLinkedCard = (
    <Card padded={false}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={UserRound} title="Not linked to a flat" description="Members without a flat, such as the office." />
      </div>
      {notLinked.length === 0 ? (
        <p className="px-5 pb-5 text-[0.9375rem] text-muted sm:px-6 sm:pb-6">Every member is linked to a flat.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notLinked.map((m) => (
            <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6">
              <Avatar name={m.name} />
              <div className="min-w-0">
                <div className="font-medium text-ink">{m.name}</div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {m.roles.map((r) => <Badge key={r} tone={r === "admin" ? "info" : "neutral"} dot={false}>{ROLE_NAMES[r] ?? r}</Badge>)}
                </div>
              </div>
              <ContactActions className="col-start-2 sm:col-start-auto" name={m.name} phone={m.phone} email={m.email} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader title="Members" intro={`Everyone in ${s.community.name} by block, with all contact details.`} />

      {view === "blocks" && <MemberFinder items={finder} />}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Blocks" value={blocks.length} icon={Building2} />
        <Stat label="Flats" value={units.length} icon={DoorOpen} />
        <Stat label="People" value={everyone} icon={Users}
          sub={notLinked.length ? `Including ${notLinked.length} without a flat` : "With an active account"} />
        <Stat label="Rented flats" value={rentedFlats} icon={KeyRound} sub={`of ${units.length} flats`} />
      </div>

      <TabLinks label="Choose a block or everyone" tabs={tabs} />

      {view === "list" ? (
        <div className="flex flex-col gap-6">
          <DataTable
            id=""
            rows={listRows}
            columns={[
              { key: "name", header: "Name", href: "{link}", subKey: "titles" },
              { key: "flat", header: "Flats", subKey: "block", subHeader: "Block", nowrap: true },
              { key: "relation", header: "Relation", filter: true, subKey: "tenancy" },
              { key: "phone", header: "Phone", href: "{tel}", nowrap: true },
              { key: "email", header: "Email", href: "mailto:{email}" },
              { key: "method", header: "Prefers" },
            ] satisfies Column[]}
            exportName="members"
            searchPlaceholder="Name, flat, phone or email"
            empty="No one matches. Try another name or flat."
          />
        </div>
      ) : active ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <BlockDirectory
              blockName={active.building_name}
              units={units.filter((u) => u.building_id === active.building_id)}
              people={rows.filter((r) => r.building_id === active.building_id)}
              badges={Object.fromEntries(rows.filter((r) => r.building_id === active.building_id)
                .map((r) => [r.profile_id, badgesFor(held.get(r.profile_id) ?? [], r.roles, r.building_id)]))}
              flatHref={`${base}/members/flat/`}
              search={false}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {(reps ?? []).length > 0 && (
              <Card padded={false}>
                <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                  <SectionHeader icon={Building2} title={`${active.building_name} contact`} description="Entrance, stairs and lift" />
                </div>
                <ul className="divide-y divide-line">
                  {(reps as KeyContact[]).map((k) => (
                    <KeyContactLine key={k.id} k={k} stacked className="px-5 py-3 sm:px-6" editHref={`${base}/contacts/${k.id}/edit`} />
                  ))}
                </ul>
              </Card>
            )}
            {notLinkedCard}
          </div>
        </div>
      ) : (
        <Card><p className="text-[0.9375rem] text-muted">No blocks have been set up yet.</p></Card>
      )}
    </>
  );
}
