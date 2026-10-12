import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { DirRow } from "@/components/people/types";
import type { ContactValues, MemberOption } from "./ContactForm";

type Client = Awaited<ReturnType<typeof createClient>>;
type Membership = { profile_id: string; role: string; profile: { full_name: string; email: string | null; phone: string | null } | null };

const ROLE_NAMES: Record<string, string> = { admin: "Administrator", treasurer: "Treasurer", owner: "Owner", tenant: "Tenant" };

/** Blocks and members for the contact form. Admin-only pages call this after requireAdmin. */
export async function loadFormOptions(supabase: Client, c: string) {
  const [{ data: buildings }, { data: memberships }, { data: dir }] = await Promise.all([
    supabase.from("buildings").select("id, name").eq("community_id", c).order("sort").order("name"),
    supabase.from("memberships").select("profile_id, role, profile:profiles(full_name, email, phone)")
      .eq("community_id", c).eq("status", "active"),
    supabase.rpc("block_directory", { c }),
  ]);

  const flats = new Map<string, string[]>();
  for (const r of (dir ?? []) as DirRow[]) {
    const list = flats.get(r.profile_id) ?? [];
    if (!list.includes(r.unit_label)) list.push(r.unit_label);
    flats.set(r.profile_id, list);
  }

  const people = new Map<string, MemberOption & { roles: string[] }>();
  for (const m of (memberships ?? []) as unknown as Membership[]) {
    if (!m.profile) continue;
    const cur = people.get(m.profile_id) ?? {
      id: m.profile_id, name: m.profile.full_name || "Unnamed member", phone: m.profile.phone, email: m.profile.email, detail: "", roles: [],
    };
    cur.roles.push(m.role);
    people.set(m.profile_id, cur);
  }
  const members: MemberOption[] = [...people.values()]
    .map(({ roles, ...m }) => ({
      ...m,
      detail: flats.get(m.id)?.join(", ") || roles.map((r) => ROLE_NAMES[r] ?? r).join(", "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { blocks: (buildings ?? []) as { id: string; name: string }[], members };
}

export const EMPTY_VALUES: ContactValues = {
  role_title: "", contact_group: "", building_id: "", profile_id: "", name: "", organisation: "",
  phone: "", whatsapp: "", email: "", hours: "", notes: "", visibility: "all", sort: "0",
};
