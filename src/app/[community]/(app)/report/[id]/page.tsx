import { notFound } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { dateTime, humanize } from "@/lib/format";
import { Avatar, Button, Card, DefinitionList, Notice, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import { METHOD_LABELS, whatsappFor, type ContactMethod } from "@/components/people/types";
import { Home, Lock, MessageSquare } from "lucide-react";
import Link from "next/link";
import OwnerNoteForm from "./OwnerNoteForm";
import { addUpdate } from "../actions";

export const metadata = { title: "Report" };

const STATUSES = ["new", "acknowledged", "in_progress", "resolved", "closed"];

export default async function ReportDetail({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ sent?: string; noted?: string }>;
}) {
  const { community, id } = await params;
  const { sent, noted } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("complaints")
    .select("*, category:complaint_categories(name), unit:units!complaints_target_unit_id_fkey(label), supplier:suppliers(name), reporter:profiles!complaints_reporter_id_fkey(full_name, email, phone)")
    .eq("id", id).maybeSingle();
  if (!r) return <OwnerView slug={s.community.slug} communityId={s.community.id} id={id} timeZone={s.community.timezone} noted={!!noted} />;
  const { data: updates } = await supabase
    .from("complaint_updates").select("id, body, new_status, created_at, internal, author_id, author:profiles(full_name)")
    .eq("complaint_id", id).order("created_at");

  const photos = r.photo_paths?.length
    ? (await supabase.storage.from("complaints").createSignedUrls(r.photo_paths, 3600)).data ?? []
    : [];
  const tz = s.community.timezone;

  const about = r.unit?.label ? `Flat ${r.unit.label}` : r.supplier?.name ?? r.location ?? humanize(r.target_type);
  const reporter = s.isAdmin && r.reporter && r.reporter_id !== s.userId
    ? await reporterContact(supabase, s.community.id, r.reporter_id, r.reporter as { full_name: string; email: string | null; phone: string | null })
    : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={r.title} back={{ href: `/${s.community.slug}/report`, label: "Reports" }} />
      {sent && <Notice tone="ok" title="Report sent">Thank you. The office has your report and will reply here.</Notice>}

      {s.isAdmin && r.target_unit_id && (
        <Link href={`/${s.community.slug}/members/flat/${r.target_unit_id}`}
          className="flex items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-5 py-4 text-ink no-underline transition-colors hover:brightness-[0.98]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-brand-text"><Home aria-hidden className="size-5" /></span>
          <span className="min-w-0">
            <span className="block font-medium">Flat {r.unit?.label}: who lives there and the neighbours</span>
            <span className="block text-sm text-muted">Call the owner, the tenant, and the flats above and below</span>
          </span>
        </Link>
      )}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={r.kind} /><StatusBadge value={r.status} />
          {r.priority !== "normal" && <StatusBadge value={r.priority} />}
        </div>
        <p className="whitespace-pre-line text-ink">{r.description}</p>
        <DefinitionList items={[
          { label: "Category", value: r.category?.name ?? "Other" },
          { label: "About", value: about },
          { label: "Reported", value: <>{dateTime(r.created_at, tz)}{s.isAdmin && r.reporter_id === s.userId ? <span className="text-muted"> · by you</span> : null}</> },
          ...(reporter ? [{
            label: "Reported by",
            value: (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <Link href={`/${s.community.slug}/admin/people/${r.reporter_id}`} className="font-medium no-underline hover:underline">{reporter.name}</Link>
                  {reporter.meta && <div className="text-sm text-muted">{reporter.meta}</div>}
                </div>
                <ContactActions name={reporter.name} phone={reporter.phone} whatsapp={reporter.whatsapp} email={reporter.email} />
              </div>
            ),
          }] : []),
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
        <SectionHeader icon={MessageSquare} title="Updates" description={(updates ?? []).length === 0
          ? s.isAdmin ? "No replies yet. When you reply, the resident gets a notification." : "No replies yet. The office will update you here."
          : undefined} />
        {(updates ?? []).length > 0 && (
          <ol className="relative mb-2 flex flex-col gap-4 border-l border-line pl-6">
            {updates!.map((u) => {
              const author = u.author_id === s.userId ? "You"
                : (u.author as unknown as { full_name: string } | null)?.full_name ?? "Office";
              return (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[2.15rem] top-0"><Avatar name={author} size="sm" className="ring-4 ring-surface" /></span>
                  <div className="text-sm text-muted"><span className="font-medium text-ink">{author}</span> · {dateTime(u.created_at, tz)}</div>
                  {u.internal && (
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Lock aria-hidden className="size-3.5" /> Private note from the flat owner. The reporter doesn&apos;t see it.</div>
                  )}
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

/** For the office: how to reach the person who made a report, the flat(s) they live in and how they like to be contacted. */
async function reporterContact(
  supabase: Awaited<ReturnType<typeof createClient>>, c: string, id: string,
  p: { full_name: string; email: string | null; phone: string | null },
) {
  const [{ data: pref }, { data: owned }, { data: rented }] = await Promise.all([
    supabase.from("contact_preferences").select("preferred_method, best_times").eq("community_id", c).eq("profile_id", id).maybeSingle(),
    supabase.from("unit_ownerships").select("unit:units(label)").eq("community_id", c).eq("owner_id", id)
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`),
    supabase.from("tenancies").select("unit:units(label)").eq("community_id", c).eq("tenant_id", id).eq("status", "active"),
  ]);
  const labels = [...new Set([...(owned ?? []), ...(rented ?? [])]
    .map((x) => (x.unit as unknown as { label: string } | null)?.label).filter((l): l is string => !!l))]
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const method = (pref?.preferred_method ?? null) as ContactMethod | null;
  return {
    name: p.full_name || "Resident",
    phone: p.phone,
    email: p.email,
    whatsapp: whatsappFor({ preferred_method: method, phone: p.phone }),
    meta: [
      labels.length ? `${labels.length === 1 ? "Flat" : "Flats"} ${labels.join(", ")}` : null,
      method ? METHOD_LABELS[method] : null,
      pref?.best_times ?? null,
    ].filter(Boolean).join(" · "),
  };
}

type FlatReport = {
  id: string; kind: string; title: string; description: string; status: string; priority: string;
  category: string | null; unit_label: string; location: string | null; created_at: string; resolved_at: string | null;
};

/** What the owner of the flat a report is about sees: the report, never who made it, plus private notes to the office. */
async function OwnerView({ slug, communityId, id, timeZone, noted }: { slug: string; communityId: string; id: string; timeZone: string; noted: boolean }) {
  const supabase = await createClient();
  const [{ data: list }, { data: notes }] = await Promise.all([
    supabase.rpc("flat_reports", { c: communityId }),
    supabase.rpc("flat_report_notes", { p_complaint: id }),
  ]);
  const r = ((list ?? []) as FlatReport[]).find((x) => x.id === id);
  if (!r) notFound();
  const sent = (notes ?? []) as { id: string; body: string; created_at: string }[];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={r.title} eyebrow={`A report about your flat ${r.unit_label}`} back={{ href: `/${slug}/report`, label: "Reports" }} />
      {noted && <Notice tone="ok" title="Note sent">The office has your note.</Notice>}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={r.kind} /><StatusBadge value={r.status} />
          {r.priority !== "normal" && <StatusBadge value={r.priority} />}
        </div>
        <p className="whitespace-pre-line text-ink">{r.description}</p>
        <DefinitionList items={[
          { label: "Category", value: r.category ?? "Other" },
          { label: "About", value: `Flat ${r.unit_label}` },
          { label: "Reported", value: dateTime(r.created_at, timeZone) },
          ...(r.resolved_at ? [{ label: "Resolved", value: dateTime(r.resolved_at, timeZone) }] : []),
        ]} />
      </Card>
      <Card>
        <SectionHeader icon={Lock} title="Notes to the office"
          description="Only the office sees these notes. The person who reported this doesn't." />
        {sent.length > 0 && (
          <ul className="mb-5 flex flex-col gap-3">
            {sent.map((n) => (
              <li key={n.id} className="rounded-xl bg-surface-2 px-4 py-3">
                <div className="text-sm text-muted">You · {dateTime(n.created_at, timeZone)}</div>
                <p className="mt-1 whitespace-pre-line text-[0.9375rem] text-ink-2">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        <OwnerNoteForm slug={slug} id={id} />
      </Card>
    </div>
  );
}
