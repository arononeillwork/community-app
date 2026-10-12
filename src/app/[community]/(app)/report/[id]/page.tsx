import { notFound } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { dateTime, humanize } from "@/lib/format";
import { Avatar, Button, Card, DefinitionList, Notice, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import { MessageSquare } from "lucide-react";
import { addUpdate } from "../actions";

export const metadata = { title: "Report" };

const STATUSES = ["new", "acknowledged", "in_progress", "resolved", "closed"];

export default async function ReportDetail({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { community, id } = await params;
  const { sent } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("complaints")
    .select("*, category:complaint_categories(name), unit:units!complaints_target_unit_id_fkey(label), supplier:suppliers(name), reporter:profiles!complaints_reporter_id_fkey(full_name)")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: updates } = await supabase
    .from("complaint_updates").select("id, body, new_status, created_at, author:profiles(full_name)")
    .eq("complaint_id", id).order("created_at");

  const photos = r.photo_paths?.length
    ? (await supabase.storage.from("complaints").createSignedUrls(r.photo_paths, 3600)).data ?? []
    : [];
  const tz = s.community.timezone;

  const about = r.unit?.label ? `Flat ${r.unit.label}` : r.supplier?.name ?? r.location ?? humanize(r.target_type);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={r.title} back={{ href: `/${s.community.slug}/report`, label: "Reports" }} />
      {sent && <Notice tone="ok" title="Report sent">Thank you. The office has your report and will reply here.</Notice>}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={r.kind} /><StatusBadge value={r.status} />
          {r.priority !== "normal" && <StatusBadge value={r.priority} />}
        </div>
        <p className="whitespace-pre-line text-ink">{r.description}</p>
        <DefinitionList items={[
          { label: "Category", value: r.category?.name ?? "Other" },
          { label: "About", value: about },
          { label: "Reported", value: <>{dateTime(r.created_at, tz)}{s.isAdmin && r.reporter ? <span className="text-muted"> · by {r.reporter.full_name}</span> : null}</> },
          ...(r.resolved_at ? [{ label: "Resolved", value: dateTime(r.resolved_at, tz) }] : []),
        ]} />
        {photos.length > 0 && (
          <div>
            <h2 className="mb-2 text-[0.9375rem] font-medium text-muted">Photos</h2>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => p.signedUrl && (
                <li key={p.path ?? i}>
                  <a href={p.signedUrl} target="_blank" rel="noopener noreferrer">
                    <img src={p.signedUrl} alt={`Photo ${i + 1} of the problem`} className="aspect-square w-full rounded-xl border border-line object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader icon={MessageSquare} title="Updates" description={(updates ?? []).length === 0 ? "No replies yet. The office will update you here." : undefined} />
        {(updates ?? []).length > 0 && (
          <ol className="relative mb-2 flex flex-col gap-4 border-l border-line pl-6">
            {updates!.map((u) => {
              const author = (u.author as unknown as { full_name: string } | null)?.full_name ?? "Office";
              return (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[2.15rem] top-0"><Avatar name={author} size="sm" className="ring-4 ring-surface" /></span>
                  <div className="text-sm text-muted"><span className="font-medium text-ink">{author}</span> · {dateTime(u.created_at, tz)}</div>
                  <p className="mt-1 whitespace-pre-line text-[0.9375rem] text-ink-2">{u.body}</p>
                  {u.new_status && <div className="mt-2 flex items-center gap-2 text-sm text-muted">Status changed to <StatusBadge value={u.new_status} /></div>}
                </li>
              );
            })}
          </ol>
        )}
        <form action={addUpdate.bind(null, s.community.slug, r.id)} className="mt-4 flex flex-col gap-3 border-t border-line pt-5">
          <div className="field">
            <label htmlFor="body">{s.isAdmin ? "Reply to the resident" : "Add more information"}</label>
            <textarea id="body" name="body" className="input" placeholder={s.isAdmin ? "e.g. The plumber is booked for Thursday morning." : "Anything the office should know?"} />
          </div>
          {s.isAdmin && (
            <div className="field sm:max-w-xs">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="input" defaultValue="">
                <option value="">Keep as {humanize(r.status)}</option>
                {STATUSES.filter((x) => x !== r.status).map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
              </select>
            </div>
          )}
          <div><Button type="submit">Send update</Button></div>
        </form>
      </Card>
    </div>
  );
}
