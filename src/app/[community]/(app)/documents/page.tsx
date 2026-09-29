import { Upload } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import { languageName, visibilityWord } from "@/components/info/labels";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  // RLS returns only documents this person may see (Everyone / Owners only / Committee only).
  const { data } = await supabase
    .from("documents")
    .select("id, title, folder, visibility, original_language, storage_path, created_at")
    .eq("community_id", s.community.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []).map((d) => ({
    id: d.id as string,
    title: d.title as string,
    folder: (d.folder as string) || "General",
    visibility: visibilityWord(d.visibility as string),
    language: languageName(d.original_language as string),
    copy: d.storage_path ? "Digital file" : "Paper copy",
    created_at: d.created_at as string,
  }));

  const folders = Array.from(new Set(rows.map((r) => r.folder))).sort((a, b) => a.localeCompare(b));

  const columns: Column[] = [
    { key: "title", header: "Document", href: `${base}/documents/{id}`, primary: true },
    { key: "folder", header: "Folder", filter: true },
    { key: "visibility", header: "Who can see it", filter: true },
    { key: "language", header: "Language", filter: true },
    { key: "copy", header: "Format", mobileHidden: true },
    { key: "created_at", header: "Added", type: "date" },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        intro="Rules, meeting minutes and other papers of the community. You only see the documents that are meant for you. Tap a title to read or download it."
        actions={s.isAdmin ? <Button href={`${base}/documents/new`} size="lg"><Upload aria-hidden className="size-5" /> Upload document</Button> : undefined}
      />
      <DataTable
        rows={rows}
        columns={columns}
        dateKey="created_at"
        defaultSort={{ key: "created_at", desc: true }}
        exportName="documents"
        searchPlaceholder="Search documents…"
        empty="No documents yet."
        views={folders.map((f) => ({ label: f, params: { f_folder: f } }))}
      />
      <p className="mt-4 text-sm text-muted">
        <strong>Who can see it:</strong> “Everyone” means all residents. “Owners only” means flat owners and the committee.
        “Committee only” means the administrator and the treasurer.
      </p>
    </>
  );
}
