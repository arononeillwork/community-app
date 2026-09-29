import clsx from "clsx";
import { AlertTriangle, Bell, CalendarDays, CheckCheck, Coins, FileText, type LucideIcon } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { inAppPath } from "@/components/info/links";
import { markAllRead, markRead, openNotification } from "./actions";

export const metadata = { title: "Alerts" };

type Note = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  meeting: { label: "Meeting", icon: CalendarDays },
  meeting_update: { label: "Meeting change", icon: CalendarDays },
  complaint: { label: "Report", icon: AlertTriangle },
  fee_reminder: { label: "Fees", icon: Coins },
  contract_due: { label: "Contract", icon: FileText },
};

const LIMIT = 100;

export default async function NotificationsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const slug = s.community.slug;
  const tz = s.community.timezone;

  // RLS: people only ever see their own alerts.
  const [{ data, count }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at", { count: "exact" })
      .eq("community_id", s.community.id)
      .eq("profile_id", s.userId)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("community_id", s.community.id)
      .eq("profile_id", s.userId)
      .is("read_at", null),
  ]);
  const notes = (data ?? []) as Note[];
  const unread = unreadCount ?? notes.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Alerts"
        intro="Messages for you about meetings, your reports and fees. The newest are at the top."
        actions={unread > 0 ? (
          <form action={markAllRead.bind(null, slug)}>
            <button className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold hover:bg-bg">
              <CheckCheck aria-hidden className="size-5" /> Mark all as read
            </button>
          </form>
        ) : undefined}
      />

      {notes.length === 0 ? (
        <Empty title="You have no alerts.">When there is news for you, such as a new meeting, it will appear here.</Empty>
      ) : (
        <>
          <p className="text-lg" aria-live="polite">
            {unread === 0 ? "You have read all your alerts." : <>You have <strong>{unread}</strong> new {unread === 1 ? "alert" : "alerts"}.</>}
          </p>
          <ol className="flex flex-col gap-3">
            {notes.map((n) => {
              const kind = KINDS[n.kind] ?? { label: "Message", icon: Bell };
              const Icon = kind.icon;
              const isNew = !n.read_at;
              const target = inAppPath(slug, n.link);
              return (
                <li key={n.id}
                  className={clsx("card flex flex-col gap-3 rounded-card border-2 p-5",
                    isNew ? "border-brand border-l-8 bg-brand-soft" : "border-line bg-surface")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isNew ? "info" : "neutral"}>{isNew ? "New" : "Read"}</Badge>
                    <span className="flex items-center gap-1 text-muted"><Icon aria-hidden className="size-5" /> {kind.label}</span>
                  </div>
                  <div>
                    <h2 className={clsx("text-xl", isNew ? "font-bold" : "font-semibold")}>{n.title}</h2>
                    {n.body && <p className="mt-1 whitespace-pre-line">{n.body}</p>}
                    <p className="mt-1 text-sm text-muted">{dateTime(n.created_at, tz)}</p>
                  </div>
                  {(target || isNew) && (
                    <div className="no-print flex flex-wrap gap-2">
                      {target && (
                        <form action={openNotification.bind(null, slug, n.id)}>
                          <button className={clsx("inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-bold",
                            isNew ? "bg-brand text-brand-ink hover:brightness-110" : "border-2 border-line-strong bg-surface hover:bg-bg")}>
                            Open<span className="sr-only">: {n.title}</span> <span aria-hidden>→</span>
                          </button>
                        </form>
                      )}
                      {isNew && (
                        <form action={markRead.bind(null, slug, n.id)}>
                          <button className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold hover:bg-bg">
                            <CheckCheck aria-hidden className="size-5" /> Mark as read<span className="sr-only">: {n.title}</span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {(count ?? 0) > LIMIT && <p className="text-muted">Showing the {LIMIT} newest alerts.</p>}
        </>
      )}
    </div>
  );
}
