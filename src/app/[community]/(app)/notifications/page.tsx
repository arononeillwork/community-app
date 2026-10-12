import clsx from "clsx";
import {
  AlertTriangle, Bell, CalendarClock, CalendarDays, CheckCheck, FileClock, FileText, KeyRound, Megaphone, MessageSquare,
  Receipt, Settings, type LucideIcon,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Empty, PageHeader, TabLinks } from "@/components/ui";
import { SubmitButton } from "@/components/me/forms";
import { dayGroup, relativeTime, type DayGroup } from "@/components/me/time";
import { markAllRead, openNotification } from "./actions";

export const metadata = { title: "Notifications" };

const LIMIT = 200;

const KINDS: Record<string, { icon: LucideIcon; label: string }> = {
  meeting: { icon: CalendarDays, label: "Meeting" },
  meeting_update: { icon: CalendarClock, label: "Meeting change" },
  meeting_reminder: { icon: CalendarClock, label: "Meeting reminder" },
  complaint: { icon: AlertTriangle, label: "New report" },
  complaint_update: { icon: MessageSquare, label: "Your report" },
  fee_reminder: { icon: Receipt, label: "Community fees" },
  levy: { icon: Receipt, label: "Community fees" },
  contract_due: { icon: FileClock, label: "Contract" },
  tenancy: { icon: KeyRound, label: "Your flat" },
  notice: { icon: Megaphone, label: "Notice" },
  document: { icon: FileText, label: "Document" },
};

const GROUPS: { key: DayGroup; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Earlier this week" },
  { key: "older", label: "Older" },
];

type Row = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { community } = await params;
  const { show } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const tz = s.community.timezone;
  const unreadOnly = show === "unread";

  const [{ data }, { count: unread }, { count: total }] = await Promise.all([
    (() => {
      let q = supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at")
        .eq("community_id", s.community.id).eq("profile_id", s.userId);
      if (unreadOnly) q = q.is("read_at", null);
      return q.order("created_at", { ascending: false }).limit(LIMIT);
    })(),
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("community_id", s.community.id).eq("profile_id", s.userId).is("read_at", null),
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("community_id", s.community.id).eq("profile_id", s.userId),
  ]);

  const rows = (data ?? []) as Row[];
  const now = new Date();
  const grouped = GROUPS.map((g) => ({ ...g, items: rows.filter((r) => dayGroup(r.created_at, tz, now) === g.key) })).filter((g) => g.items.length);
  const unreadCount = unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        intro={unreadCount ? `You have ${unreadCount} unread.` : (total ?? 0) > 0 ? "You're all caught up." : undefined}
        actions={unreadCount > 0 ? (
          <form action={markAllRead.bind(null, s.community.slug)}>
            <SubmitButton variant="secondary" pendingText="Marking…"><CheckCheck aria-hidden className="size-4" /> Mark all as read</SubmitButton>
          </form>
        ) : undefined}
      />

      {(total ?? 0) > 0 && (
        <TabLinks label="Show" tabs={[
          { href: `${base}/notifications`, label: "All", active: !unreadOnly },
          { href: `${base}/notifications?show=unread`, label: "Unread", active: unreadOnly, count: unreadCount },
        ]} />
      )}

      {rows.length === 0 ? (
        unreadOnly && (total ?? 0) > 0 ? (
          <Empty icon={CheckCheck} title="You're all caught up" action={<Button variant="secondary" href={`${base}/notifications`}>Show all</Button>}>
            Nothing unread. Older notifications are still under All.
          </Empty>
        ) : (
          <Empty icon={Bell} title="No notifications yet"
            action={<Button variant="secondary" href={`${base}/settings#notifications`}><Settings aria-hidden className="size-4" /> Choose how we contact you</Button>}>
            Meetings, replies to your reports and anything that needs your attention will appear here.
          </Empty>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`group-${g.key}`}>
              <h2 id={`group-${g.key}`} className="mb-2 px-1 text-[0.9375rem] font-medium text-muted">{g.label}</h2>
              <Card padded={false} className="overflow-hidden">
                <ul className="@container divide-y divide-line">
                  {g.items.map((n) => {
                    const kind = KINDS[n.kind] ?? { icon: Bell, label: "Update" };
                    const isUnread = !n.read_at;
                    return (
                      <li key={n.id}>
                        <form action={openNotification.bind(null, s.community.slug, n.id)}>
                          <button type="submit" className="group flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:rounded-none focus-visible:outline-offset-[-3px] sm:px-6">
                            {/* The kind icon gives way to the text when large text leaves little room. */}
                            <span className={clsx("hidden size-10 shrink-0 place-items-center rounded-xl @2xs:grid",
                              isUnread ? "bg-brand-soft text-brand-text" : "bg-surface-2 text-muted ring-1 ring-inset ring-line")}>
                              <kind.icon aria-hidden className="size-[1.15rem]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={clsx("block leading-snug", isUnread ? "font-medium text-ink" : "text-ink-2")}>
                                {isUnread && <span className="sr-only">Unread: </span>}{n.title}
                              </span>
                              {n.body && <span className="mt-0.5 line-clamp-2 block text-[0.9375rem] leading-snug text-muted">{n.body}</span>}
                              <span className="mt-1 block text-sm text-muted">
                                <time dateTime={n.created_at}>{relativeTime(n.created_at, tz, now)}</time> · {kind.label}
                              </span>
                            </span>
                            {isUnread && <span aria-hidden className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" />}
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          {rows.length === LIMIT && <p className="hint px-1">Showing the latest {LIMIT}.</p>}
        </div>
      )}
    </div>
  );
}
