import Link from "next/link";
import {
  AlertTriangle, ArrowRight, BookOpen, Building2, Clock, Contact, FileText, Home, KeyRound, MessageCircleQuestion,
  Palette, ShieldAlert, Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { humanize } from "@/lib/format";
import { Card, Empty, Notice, PageHeader, SectionHeader, Stat, StatusBadge } from "@/components/ui";
import UnansweredQuestion from "@/components/admin/UnansweredQuestion";
import { ago } from "@/components/admin/format";
import { addToFaq, dismissQuestion } from "./actions";

export const metadata = { title: "Administration" };

const OPEN = ["new", "acknowledged", "in_progress"];
const CHANNELS: Record<string, string> = { chat: "Chat", voice: "Voice", whatsapp: "WhatsApp" };

type Tally = { category_name: string; complaint_count: number };
type OldReport = { id: string; title: string; created_at: string; status: string; priority: string; category: { name: string } | null };
type Question = {
  id: string; content: string; created_at: string;
  conversation: { channel: string; profile: { full_name: string } | null } | null;
};

export default async function AdminOverview({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ faq?: string; dismissed?: string }>;
}) {
  const { community } = await params;
  const { faq, dismissed } = await searchParams;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;

  const [members, flats, tenancies, open, tallies, oldest, questions] = await Promise.all([
    supabase.from("memberships").select("profile_id").eq("community_id", c).eq("status", "active"),
    supabase.from("units").select("id", { count: "exact", head: true }).eq("community_id", c),
    supabase.from("tenancies").select("unit_id, status").eq("community_id", c).in("status", ["active", "pending"]),
    supabase.from("complaints").select("id, priority").eq("community_id", c).in("status", OPEN),
    supabase.from("v_complaint_tallies").select("category_name, complaint_count").eq("community_id", c).in("status", OPEN),
    supabase.from("complaints").select("id, title, created_at, status, priority, category:complaint_categories(name)")
      .eq("community_id", c).in("status", OPEN).order("created_at").limit(5),
    supabase.from("assistant_messages").select("id, content, created_at, conversation:assistant_conversations(channel, profile:profiles(full_name))")
      .eq("community_id", c).eq("unanswered", true).eq("role", "user").order("created_at", { ascending: false }).limit(25),
  ]);

  const memberCount = new Set((members.data ?? []).map((m) => m.profile_id)).size;
  const rented = new Set((tenancies.data ?? []).filter((t) => t.status === "active").map((t) => t.unit_id)).size;
  const pending = (tenancies.data ?? []).filter((t) => t.status === "pending").length;
  const openReports = open.data ?? [];
  const urgent = openReports.filter((r) => r.priority === "urgent" || r.priority === "high").length;

  const byCategory = new Map<string, number>();
  for (const t of (tallies.data ?? []) as Tally[]) byCategory.set(t.category_name, (byCategory.get(t.category_name) ?? 0) + Number(t.complaint_count));
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxCount = Math.max(1, ...categories.map(([, n]) => n));

  const oldReports = (oldest.data ?? []) as unknown as OldReport[];
  const unanswered = (questions.data ?? []) as unknown as Question[];

  const links = [
    { href: `${base}/admin/people`, label: "People", text: "Members, invites and roles", icon: Users },
    { href: `${base}/contacts`, label: "Key contacts", text: "President, concierge, office", icon: Contact },
    { href: `${base}/admin/community`, label: "Community profile", text: "Landing page, colours, settings", icon: Palette },
    { href: `${base}/admin/blocks`, label: "Blocks and flats", text: "Flats, floors and shares", icon: Building2 },
    { href: `${base}/info`, label: "Info pages", text: "Rules, bins, pool, parking", icon: BookOpen },
    { href: `${base}/documents`, label: "Documents", text: "Statutes, minutes, insurance", icon: FileText },
  ];

  return (
    <>
      <PageHeader title="Administration" intro={`What needs attention at ${s.community.name} today.`} />
      <div className="flex flex-col gap-6">

      {faq && <Notice tone="ok" title="Added to the FAQ">The assistant will use your answer for questions like this one.</Notice>}
      {dismissed && <Notice tone="info">Question dismissed.</Notice>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <Stat label="Members" value={memberCount} icon={Users} href={`${base}/admin/people`} sub="With an active account" />
        <Stat label="Flats" value={flats.count ?? 0} icon={Home} href={`${base}/admin/blocks`} sub="Across all blocks" />
        <Stat label="Rented flats" value={rented} icon={KeyRound} href={`${base}/admin/people?role=tenant`} sub="Flats with a tenant" />
        <Stat label="Open reports" value={openReports.length} icon={AlertTriangle} href={`${base}/report`} sub="Not resolved yet" />
        <Stat label="Urgent or high" value={urgent} icon={ShieldAlert} href={`${base}/report`} tone={urgent > 0 ? "bad" : undefined}
          sub={urgent > 0 ? "Open reports to look at first" : "Nothing urgent"} />
        <Stat label="Tenancies to approve" value={pending} icon={Clock} href={`${base}/admin/people#pending`} tone={pending > 0 ? "warn" : undefined}
          sub={pending > 0 ? "Added by landlords" : "Nothing waiting"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader icon={AlertTriangle} title="Open reports by category" description={openReports.length ? `${openReports.length} open in total` : undefined} />
          {categories.length ? (
            <ul className="flex flex-col gap-3">
              {categories.map(([name, n]) => (
                <li key={name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.9375rem]">
                    <span className="text-ink-2">{name}</span>
                    <span className="tabular text-muted">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line" aria-hidden>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (n / maxCount) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.9375rem] text-muted">No open reports. Everything residents reported has been dealt with.</p>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-5 pb-1 sm:p-6 sm:pb-1">
            <SectionHeader icon={Clock} title="Waiting longest" description="The oldest reports that are still open"
              action={<Link href={`${base}/report`} className="text-sm font-medium no-underline hover:underline">All reports</Link>} />
          </div>
          {oldReports.length ? (
            <ul className="divide-y divide-line">
              {oldReports.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/report/${r.id}`} className="group flex items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-surface-2/70 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium group-hover:underline">{r.title}</div>
                      <div className="text-sm text-muted">{r.category?.name ?? "Other"} · {ago(r.created_at)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {(r.priority === "urgent" || r.priority === "high") && <StatusBadge value={r.priority} />}
                      <StatusBadge value={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[0.9375rem] text-muted sm:px-6 sm:pb-6">No open reports.</p>
          )}
        </Card>
      </div>

      <Card padded={false}>
        <div id="questions" className="scroll-mt-24 p-5 pb-1 sm:p-6 sm:pb-1">
          <SectionHeader icon={MessageCircleQuestion} title="Questions the assistant couldn't answer"
            description="Answer once and the assistant will know it next time." />
        </div>
        {unanswered.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {unanswered.map((q) => (
              <UnansweredQuestion key={q.id} id={q.id} question={q.content}
                meta={[q.conversation?.profile?.full_name, q.conversation ? CHANNELS[q.conversation.channel] ?? humanize(q.conversation.channel) : null, ago(q.created_at)]
                  .filter(Boolean).join(" · ")}
                addAction={addToFaq.bind(null, s.community.slug, q.id)}
                dismissAction={dismissQuestion.bind(null, s.community.slug, q.id)} />
            ))}
          </ul>
        ) : (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <Empty title="No unanswered questions" icon={MessageCircleQuestion}>
              When a resident asks something the assistant doesn&apos;t know, it appears here so you can add the answer.
            </Empty>
          </div>
        )}
      </Card>

      <section aria-labelledby="manage">
        <h2 id="manage" className="mb-3 text-[1.0625rem] font-semibold">Manage</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((x) => (
            <li key={x.href}>
              <Link href={x.href} className="group flex h-full items-center gap-3.5 rounded-card border border-line bg-surface p-4 text-ink no-underline shadow-card transition-colors hover:border-brand-line">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                  <x.icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{x.label}</span>
                  <span className="block truncate text-sm text-muted">{x.text}</span>
                </span>
                <ArrowRight aria-hidden className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      </div>
    </>
  );
}
