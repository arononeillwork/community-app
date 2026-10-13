import { Plus } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, PageHeader } from "@/components/ui";
import DataTable, { type Column, type SavedView } from "@/components/DataTable";

export const metadata = { title: "Reports" };

const OPEN = new Set(["new", "acknowledged", "in_progress"]);

export default async function ReportsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  // RLS returns the person's own reports (everything for the office). Owners also get reports
  // about their flats through flat_reports(), which never says who made them.
  const [{ data }, flat] = await Promise.all([
    supabase.from("complaints")
      .select("id, kind, title, status, priority, target_type, location, created_at, category:complaint_categories(name), unit:units!complaints_target_unit_id_fkey(label), supplier:suppliers(name)")
      .eq("community_id", s.community.id)
      .order("created_at", { ascending: false }),
    s.isOwner && !s.isAdmin ? supabase.rpc("flat_reports", { c: s.community.id }) : Promise.resolve({ data: [] }),
  ]);

  type Own = { id: string; kind: string; title: string; status: string; priority: string; location: string | null; created_at: string;
    category: { name: string } | null; unit: { label: string } | null; supplier: { name: string } | null };
  const own = ((data ?? []) as unknown as Own[]).map((r) => ({
    id: r.id, kind: r.kind, title: r.title, status: r.status, priority: r.priority, created_at: r.created_at,
    category: r.category?.name ?? "Other",
    about: r.unit?.label ? `Flat ${r.unit.label}` : r.supplier?.name ?? r.location ?? "Common area",
    who: "You",
  }));
  type Flat = { id: string; kind: string; title: string; status: string; priority: string; category: string | null; unit_label: string; created_at: string };
  const aboutMine = ((flat.data ?? []) as Flat[]).map((r) => ({
    id: r.id, kind: r.kind, title: r.title, status: r.status, priority: r.priority, created_at: r.created_at,
    category: r.category ?? "Other", about: `Flat ${r.unit_label}`, who: "About your flat",
  }));
  // Derived fields so saved views (and links from Home and Administration) can match the counts shown there.
  const rows = [...own, ...aboutMine]
    .map((r) => ({
      ...r,
      state: OPEN.has(r.status) ? "Open" : "Closed",
      urgency: r.priority === "urgent" || r.priority === "high" ? "Yes" : "No",
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const columns: Column[] = [
    { key: "title", header: "Report", href: `${base}/report/{id}`, primary: true, subKey: "category", subHeader: "Category" },
    { key: "kind", header: "Type", type: "status", filter: true },
    { key: "category", header: "Category", filter: true, hidden: true },
    { key: "about", header: "About", mobileHidden: !s.isAdmin },
    ...(aboutMine.length ? [{ key: "who", header: "Reported by", filter: true } as Column] : []),
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "priority", header: "Priority", type: "status", filter: true, mobileHidden: true },
    { key: "state", header: "Open or closed", filter: true, hidden: true },
    ...(s.isAdmin ? [{ key: "urgency", header: "Urgent or high", filter: true, hidden: true } as Column] : []),
    { key: "created_at", header: "Reported", type: "date" },
  ];

  // Empty values keep "Open" from also lighting up when a narrower open view is chosen.
  const views: SavedView[] = [
    { label: "Open", params: s.isAdmin ? { f_state: "Open", f_kind: "", f_urgency: "" } : { f_state: "Open" } },
    ...(s.isAdmin ? [
      // Same set as the red number next to Reports in the menu.
      { label: "New", params: { f_status: "new" } },
      { label: "Urgent or high", params: { f_state: "Open", f_urgency: "Yes" } },
      { label: "Incidents", params: { f_state: "Open", f_kind: "incident" } },
      { label: "Complaints", params: { f_state: "Open", f_kind: "complaint" } },
    ] : []),
    ...(aboutMine.length ? [
      { label: "Reported by me", params: { f_who: "You" } },
      { label: "About my flat", params: { f_who: "About your flat" } },
    ] : []),
    { label: "Closed", params: { f_state: "Closed" } },
  ];

  return (
    <>
      <PageHeader
        title={s.isAdmin ? "All reports" : "Reports"}
        intro={s.isAdmin ? "Incidents and complaints from residents. Open one to reply or change its status."
          : aboutMine.length ? "Problems you've reported, and reports about your flat." : "Problems you've reported, and what is happening with them."}
        actions={<Button href={`${base}/report/new`}><Plus aria-hidden className="size-4" /> Report a problem</Button>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        dateKey="created_at"
        defaultSort={{ key: "created_at", desc: true }}
        exportName="reports"
        timeZone={s.community.timezone}
        searchPlaceholder="Search reports…"
        empty={s.isAdmin ? "No reports yet." : "You haven't reported anything yet."}
        views={views}
      />
    </>
  );
}
