import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  // RLS returns only what this person may see (own reports; admins see all; owners see ones about their flat).
  const { data } = await supabase
    .from("complaints")
    .select("id, kind, title, status, priority, target_type, location, created_at, photo_paths, category:complaint_categories(name), unit:units!complaints_target_unit_id_fkey(label), supplier:suppliers(name)")
    .eq("community_id", s.community.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []).map((c) => {
    const r = c as unknown as { category: { name: string } | null; unit: { label: string } | null; supplier: { name: string } | null } & typeof c;
    return {
      id: r.id, kind: r.kind, title: r.title, status: r.status, priority: r.priority, created_at: r.created_at,
      category: r.category?.name ?? "Other",
      about: r.unit?.label ? `Flat ${r.unit.label}` : r.supplier?.name ?? r.location ?? "Common area",
      photos: r.photo_paths?.length ?? 0,
    };
  });

  const columns: Column[] = [
    { key: "title", header: "Report", href: `${base}/report/{id}`, primary: true },
    { key: "kind", header: "Type", type: "status", filter: true },
    { key: "category", header: "Category", filter: true },
    { key: "about", header: "About" },
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "priority", header: "Priority", type: "status", filter: true },
    { key: "photos", header: "Photos", type: "number", mobileHidden: true },
    { key: "created_at", header: "Reported", type: "date" },
  ];

  return (
    <>
      <PageHeader
        title={s.isAdmin ? "All reports" : "My reports"}
        intro={s.isAdmin ? "Incidents and complaints from residents. Open one to reply or change its status." : "Problems you have reported, and what is happening with them."}
        actions={<Button href={`${base}/report/new`}><Plus aria-hidden className="size-4" /> Report a problem</Button>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        dateKey="created_at"
        defaultSort={{ key: "created_at", desc: true }}
        exportName="reports"
        searchPlaceholder="Search reports…"
        empty="No reports yet."
        views={[
          { label: "Open", params: { f_status: "new" } },
          { label: "Incidents", params: { f_kind: "incident" } },
          { label: "Complaints", params: { f_kind: "complaint" } },
          { label: "Urgent", params: { f_priority: "urgent" } },
        ]}
      />
    </>
  );
}
