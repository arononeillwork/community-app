import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import AppShell, { type NavGroup } from "@/components/shell/AppShell";

const ROLE_NAMES: Record<string, string> = { admin: "Administrator", treasurer: "Treasurer", owner: "Owner", tenant: "Resident" };

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ count: unread }, newReports, { data: concierge }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("community_id", s.community.id).eq("profile_id", s.userId).is("read_at", null),
    s.isAdmin
      ? supabase.from("complaints").select("id", { count: "exact", head: true }).eq("community_id", s.community.id).eq("status", "new").then((r) => r.count ?? 0)
      : Promise.resolve(0),
    supabase.from("key_contacts").select("role_title, name, phone, hours")
      .eq("community_id", s.community.id).eq("contact_group", "staff").is("building_id", null)
      .not("phone", "is", null).order("sort").limit(1).maybeSingle(),
  ]);

  const groups: NavGroup[] = [
    { items: [
      { href: `${base}/home`, label: "Home", icon: "home", exact: true },
      { href: `${base}/ask`, label: "Ask a question", icon: "ask" },
    ] },
    { label: "Community", items: [
      { href: `${base}/report`, label: s.isAdmin ? "Reports" : "Report a problem", icon: "report", badge: newReports || undefined },
      { href: `${base}/meetings`, label: "Meetings", icon: "meetings" },
      { href: `${base}/info`, label: "Bins & info", icon: "info" },
      { href: `${base}/local`, label: "Local area", icon: "local" },
      { href: `${base}/documents`, label: "Documents", icon: "documents" },
    ] },
    { label: "People", items: [
      { href: `${base}/members`, label: "Members", icon: "members" },
      { href: `${base}/contacts`, label: "Key contacts", icon: "contacts" },
    ] },
    { label: "My home", items: [
      ...(s.isOwner ? [{ href: `${base}/my-units`, label: "My flat", icon: "myflat" as const }] : []),
      { href: `${base}/money`, label: "Where the money goes", icon: "money" },
    ] },
    ...(s.isFinance || s.isAdmin ? [{ label: "Management", items: [
      ...(s.isFinance ? [{ href: `${base}/finance`, label: "Finance", icon: "finance" as const }] : []),
      ...(s.isAdmin ? [{ href: `${base}/admin`, label: "Administration", icon: "admin" as const }] : []),
    ] }] : []),
  ];

  return (
    <AppShell
      community={{ name: s.community.name, slug: s.community.slug, logo: s.community.branding?.logo_url ?? null }}
      user={{ name: s.fullName, email: s.email, roleLabel: s.roles.map((r) => ROLE_NAMES[r] ?? r).join(" · ") }}
      groups={groups}
      unread={unread ?? 0}
      help={concierge?.phone ? { title: concierge.role_title, name: concierge.name, phone: concierge.phone, hours: concierge.hours } : null}
      signOut={signOut.bind(null, s.community.slug)}
    >
      {children}
    </AppShell>
  );
}
