import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type Person = { id: string; name: string; email: string | null; phone: string | null; preferred: string | null };

/**
 * Owners and tenants per flat, readable by finance users. Profiles are private (only administrators
 * may read them directly), so names and contact details come from directory(), which applies each
 * person's sharing preference; ownerships are readable by every member.
 */
export async function peopleByUnit(supabase: Client, communityId: string, units: { id: string; label: string }[]) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: ownerships }, { data: directory }] = await Promise.all([
    supabase.from("unit_ownerships").select("unit_id, owner_id, end_date").eq("community_id", communityId),
    supabase.rpc("directory", { c: communityId }),
  ]);
  const byId = new Map<string, { full_name: string; email: string | null; phone: string | null; preferred_method: string | null; roles: string[] | null; units: string[] | null }>(
    ((directory ?? []) as { profile_id: string; full_name: string; email: string | null; phone: string | null; preferred_method: string | null; roles: string[] | null; units: string[] | null }[])
      .map((d) => [d.profile_id, d]),
  );
  const toPerson = (id: string): Person => {
    const d = byId.get(id);
    return { id, name: d?.full_name || "Owner", email: d?.email ?? null, phone: d?.phone ?? null, preferred: d?.preferred_method ?? null };
  };

  const owners = new Map<string, Person[]>();
  for (const o of ownerships ?? []) {
    if (o.end_date && o.end_date < today) continue;
    owners.set(o.unit_id, [...(owners.get(o.unit_id) ?? []), toPerson(o.owner_id)]);
  }

  // Tenants: members with the tenant role linked to the flat's label who are not its owners.
  const tenants = new Map<string, Person[]>();
  for (const u of units) {
    const ownerIds = new Set((owners.get(u.id) ?? []).map((p) => p.id));
    const list = [...byId.entries()]
      .filter(([pid, d]) => !ownerIds.has(pid) && (d.roles ?? []).includes("tenant") && (d.units ?? []).includes(u.label))
      .map(([pid]) => toPerson(pid));
    if (list.length) tenants.set(u.id, list);
  }
  return { owners, tenants };
}
