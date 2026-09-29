import { notFound } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { dateTime, humanize } from "@/lib/format";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={r.title} back={{ href: `/${s.community.slug}/report`, label: "Reports" }} />
      {sent && <Notice tone="ok">Thank you — your report has been sent to the office.</Notice>}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={r.kind} /><StatusBadge value={r.status} />
          {r.priority !== "normal" && <StatusBadge value={r.priority} />}
        </div>
        <p className="whitespace-pre-line text-lg">{r.description}</p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="font-bold">Category</dt><dd>{r.category?.name ?? "Other"}</dd>
          <dt className="font-bold">About</dt>
          <dd>{r.unit?.label ? `Flat ${r.unit.label}` : r.supplier?.name ?? r.location ?? humanize(r.target_type)}</dd>
          <dt className="font-bold">Reported</dt><dd>{dateTime(r.created_at, tz)}{s.isAdmin && r.reporter ? ` by ${r.reporter.full_name}` : ""}</dd>
          {r.resolved_at && (<><dt className="font-bold">Resolved</dt><dd>{dateTime(r.resolved_at, tz)}</dd></>)}
        </dl>
        {photos.length > 0 && (
          <div>
            <h2 className="mb-2 text-lg font-bold">Photos</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        <h2 className="mb-3 text-xl font-bold">Updates</h2>
        {(updates ?? []).length === 0 ? <p className="text-muted">No replies yet. The office will update you here.</p> : (
          <ol className="flex flex-col gap-3">
            {updates!.map((u) => (
              <li key={u.id} className="rounded-xl border-l-4 border-brand bg-bg p-4">
                <div className="text-sm text-muted">{dateTime(u.created_at, tz)} · {(u.author as unknown as { full_name: string } | null)?.full_name ?? "Office"}</div>
                <p className="mt-1">{u.body}</p>
                {u.new_status && <div className="mt-2"><StatusBadge value={u.new_status} /></div>}
              </li>
            ))}
          </ol>
        )}
        <form action={addUpdate.bind(null, s.community.slug, r.id)} className="mt-5 flex flex-col gap-3">
          <div className="field">
            <label htmlFor="body">{s.isAdmin ? "Reply to the resident" : "Add more information"}</label>
            <textarea id="body" name="body" className="input" />
          </div>
          {s.isAdmin && (
            <div className="field">
              <label htmlFor="status">Change status</label>
              <select id="status" name="status" className="input" defaultValue="">
                <option value="">Keep as {humanize(r.status)}</option>
                {STATUSES.filter((x) => x !== r.status).map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
              </select>
            </div>
          )}
          <button className="min-h-12 w-fit rounded-xl bg-brand px-6 font-bold text-brand-ink">Send</button>
        </form>
      </Card>
    </div>
  );
}
