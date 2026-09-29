import Link from "next/link";
import {
  AlertTriangle, BookOpen, CalendarDays, Coins, FileText, Home as HomeIcon, Map, MessageCircleQuestion,
  PiggyBank, Settings, Trash2, Users, Wrench,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS, dateTime } from "@/lib/format";
import { Card } from "@/components/ui";

export const metadata = { title: "Home" };

export default async function HomePage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const tomorrow = new Date(Date.now() + 86400000);
  const [{ data: bins }, { data: nextMeeting }] = await Promise.all([
    supabase.from("bin_schedules").select("bin_type, color, color_hex, weekdays").eq("community_id", s.community.id).order("sort"),
    supabase.from("meetings").select("id, title, starts_at, location, meeting_url").eq("community_id", s.community.id)
      .eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
  ]);
  const binsTomorrow = (bins ?? []).filter((b) => b.weekdays.includes(tomorrow.getDay()) && b.weekdays.length < 7);

  const tiles = [
    { href: `${base}/ask`, label: "Ask a question", icon: MessageCircleQuestion, big: true },
    { href: `${base}/report/new`, label: "Report a problem", icon: AlertTriangle },
    { href: `${base}/info`, label: "Bins & info", icon: Trash2 },
    { href: `${base}/meetings`, label: "Meetings", icon: CalendarDays },
    { href: `${base}/contacts`, label: "Contacts", icon: Users },
    { href: `${base}/local`, label: "Local area", icon: Map },
    { href: `${base}/documents`, label: "Documents", icon: FileText },
    { href: `${base}/money`, label: "Where the money goes", icon: PiggyBank },
    ...(s.isOwner ? [{ href: `${base}/my-units`, label: "My flat & fees", icon: HomeIcon }] : []),
    ...(s.isFinance ? [{ href: `${base}/finance`, label: "Finance", icon: Coins }] : []),
    ...(s.isAdmin ? [{ href: `${base}/admin`, label: "Administration", icon: Wrench }] : []),
    { href: `${base}/settings`, label: "Text size & settings", icon: Settings },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Hello{s.fullName ? `, ${s.fullName.split(" ")[0]}` : ""}</h1>
        <p className="text-muted">What would you like to do?</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="!bg-brand-soft">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><Trash2 aria-hidden className="size-6" /> Bins tomorrow ({WEEKDAYS[tomorrow.getDay()]})</h2>
          <ul className="flex flex-wrap gap-2">
            <li className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 font-bold">
              <span className="size-4 rounded-full" style={{ background: "#6b7280" }} aria-hidden /> General waste
            </li>
            {binsTomorrow.map((b) => (
              <li key={b.bin_type} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 font-bold">
                <span className="size-4 rounded-full border border-line-strong" style={{ background: b.color_hex }} aria-hidden />
                {b.bin_type} <span className="font-normal text-muted">({b.color})</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="!bg-brand-soft">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><CalendarDays aria-hidden className="size-6" /> Next meeting</h2>
          {nextMeeting ? (
            <Link href={`${base}/meetings/${nextMeeting.id}`} className="block no-underline text-ink">
              <div className="text-lg font-bold underline">{nextMeeting.title}</div>
              <div>{dateTime(nextMeeting.starts_at, s.community.timezone)}</div>
              <div className="text-muted">{nextMeeting.location ?? (nextMeeting.meeting_url ? "Online meeting" : "")}</div>
            </Link>
          ) : <p>No meetings planned.</p>}
        </Card>
      </div>

      <nav aria-label="Sections">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.href} className={t.big ? "col-span-2 sm:col-span-1" : ""}>
              <Link href={t.href}
                className={`card flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-card border-2 p-5 text-center text-lg font-bold no-underline transition-colors ${
                  t.big ? "border-brand bg-brand text-brand-ink hover:brightness-110" : "border-line bg-surface text-ink hover:border-brand"}`}>
                <t.icon aria-hidden className="size-10" strokeWidth={1.75} />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="flex items-center gap-2 text-muted"><BookOpen aria-hidden className="size-5" /> Tip: tap “Text size &amp; settings” to make everything bigger.</p>
    </div>
  );
}
