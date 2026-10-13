import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CalendarDays, Contact, FileText, Map, Megaphone, PiggyBank, Sparkles, Trash2, Users,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS, date } from "@/lib/format";
import { Avatar, Badge, Button, Card, SectionHeader } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import { todayAndTomorrow } from "@/components/library/meta";

export const metadata = { title: "Home" };

function partOfDay(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const tz = s.community.timezone;
  const c = s.community.id;

  const { tomorrow } = todayAndTomorrow(tz); // weekday number in the community's time zone
  const [{ data: bins }, { data: nextMeeting }, { data: contacts }, { data: blocks }, reports] = await Promise.all([
    supabase.from("bin_schedules").select("bin_type, color, color_hex, weekdays").eq("community_id", c).order("sort"),
    supabase.from("meetings").select("id, title, starts_at, location, meeting_url").eq("community_id", c)
      .eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
    supabase.from("key_contacts").select("id, role_title, contact_group, name, organisation, phone, whatsapp, email, hours, building_id, sort")
      .eq("community_id", c).in("contact_group", ["staff", "management", "committee", "emergency"]).order("sort"),
    supabase.rpc("block_summary", { c }),
    s.isAdmin
      ? supabase.from("complaints").select("status, priority").eq("community_id", c).in("status", ["new", "acknowledged", "in_progress"])
      : supabase.from("complaints").select("status, priority").eq("community_id", c).eq("reporter_id", s.userId).in("status", ["new", "acknowledged", "in_progress"]),
  ]);

  const binsTomorrow = (bins ?? []).filter((b) => b.weekdays.includes(tomorrow));
  const open = reports.data ?? [];
  const urgent = open.filter((r) => r.priority === "urgent" || r.priority === "high").length;

  // The people residents need most: on-site help, the office, their own block representative, emergencies.
  const all = contacts ?? [];
  const pick = [
    all.find((k) => k.contact_group === "staff"),
    all.find((k) => k.contact_group === "management" && k.role_title.toLowerCase().includes("office")) ?? all.find((k) => k.contact_group === "management"),
    s.isAdmin ? undefined : all.find((k) => k.building_id),
    all.find((k) => k.contact_group === "committee" && k.role_title === "President"),
    all.find((k) => k.contact_group === "emergency"),
  ].filter((k, i, arr): k is NonNullable<typeof k> => !!k && arr.indexOf(k) === i).slice(0, 4);

  const myBlocks = (blocks ?? []).filter((b: { is_mine: boolean }) => b.is_mine);
  const notices = s.community.info?.public_notices ?? [];
  const meetingDay = nextMeeting ? new Date(nextMeeting.starts_at) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => meetingDay ? new Intl.DateTimeFormat("en-GB", { ...o, timeZone: tz }).format(meetingDay) : "";
  const todayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());

  const shortcuts = [
    { href: `${base}/members`, label: "Members", text: "Neighbours in your block", icon: Users },
    { href: `${base}/info`, label: "Bins & info", text: "Bin days, rules, pool, parking", icon: Trash2 },
    { href: `${base}/meetings`, label: "Meetings", text: "Dates, agendas and minutes", icon: CalendarDays },
    { href: `${base}/documents`, label: "Documents", text: "Statutes, minutes, insurance", icon: FileText },
    { href: `${base}/local`, label: "Local area", text: "Walks, cafés, pharmacy, buses", icon: Map },
    { href: `${base}/money`, label: "Where the money goes", text: "This year's spending", icon: PiggyBank },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.9375rem] text-muted">{todayLabel}</p>
          <h1 className="mt-0.5 text-[1.75rem] font-semibold leading-tight sm:text-[2rem]">
            {partOfDay(tz)}{s.fullName ? `, ${s.fullName.split(" ")[0]}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href={`${base}/ask`} variant="secondary"><Sparkles aria-hidden className="size-4" /> Ask a question</Button>
          <Button href={`${base}/report/new`}><AlertTriangle aria-hidden className="size-4" /> Report a problem</Button>
        </div>
      </div>

      {/* Today */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4">
        <Card className="flex flex-col">
          <SectionHeader icon={Trash2} title="Bins tomorrow" description={WEEKDAYS[tomorrow]} />
          <ul className="flex flex-col gap-2">
            {binsTomorrow.map((b) => (
              <li key={b.bin_type} className="flex items-center gap-2.5 text-[0.9375rem]">
                <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: b.color_hex }} />
                <span className="text-ink">{b.bin_type}</span>
                <span className="text-muted">· {b.color}</span>
              </li>
            ))}
          </ul>
          <Link href={`${base}/info`} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium no-underline hover:underline">
            All bin days <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Card>

        <Card className="flex flex-col">
          <SectionHeader icon={CalendarDays} title="Next meeting" />
          {nextMeeting ? (
            <Link href={`${base}/meetings/${nextMeeting.id}`} className="group flex gap-4 rounded-xl text-ink no-underline">
              <div className="flex w-14 shrink-0 flex-col items-center rounded-xl border border-line bg-surface-2 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-brand-text">{fmt({ month: "short" })}</span>
                <span className="text-xl font-semibold leading-tight tabular">{fmt({ day: "numeric" })}</span>
              </div>
              <div className="min-w-0">
                <div className="font-medium leading-snug group-hover:underline">{nextMeeting.title}</div>
                <div className="mt-0.5 text-[0.9375rem] text-muted">{fmt({ weekday: "long" })} at {fmt({ hour: "2-digit", minute: "2-digit" })}</div>
                <div className="text-[0.9375rem] text-muted">{nextMeeting.location ?? (nextMeeting.meeting_url ? "Online" : "")}</div>
              </div>
            </Link>
          ) : <p className="text-[0.9375rem] text-muted">No meetings planned.</p>}
          <Link href={`${base}/meetings`} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium no-underline hover:underline">
            All meetings <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Card>

        <Card className="flex flex-col">
          <SectionHeader icon={AlertTriangle} title={s.isAdmin ? "Open reports" : "Your reports"} />
          <div className="flex items-baseline gap-2">
            <span className="text-[2rem] font-semibold leading-none tabular">{open.length}</span>
            <span className="text-[0.9375rem] text-muted">{open.length === 1 ? "open report" : "open reports"}</span>
          </div>
          {urgent > 0 && <div className="mt-2"><Badge tone="bad">{urgent} high priority</Badge></div>}
          {!s.isAdmin && open.length === 0 && <p className="mt-2 text-[0.9375rem] text-muted">Nothing waiting. Something broken? Let the office know.</p>}
          <Link href={`${base}/report`} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium no-underline hover:underline">
            {s.isAdmin ? "Review reports" : "See your reports"} <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[2_1_30rem]" padded={false}>
          <div className="p-5 pb-1 sm:p-6 sm:pb-1">
            <SectionHeader icon={Contact} title="Who to call" description="The people residents need most often"
              action={<Button href={`${base}/contacts`} variant="ghost" size="sm">All contacts</Button>} />
          </div>
          <ul className="divide-y divide-line">
            {pick.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6">
                <Avatar name={k.name ?? k.organisation ?? k.role_title} />
                <div className="min-w-[min(100%,9rem)] flex-1">
                  <div className="text-sm text-muted">{k.role_title}</div>
                  <div className="truncate font-medium text-ink">{k.name ?? k.organisation}</div>
                  {k.hours && <div className="truncate text-sm text-muted">{k.hours}</div>}
                </div>
                <ContactActions name={k.name ?? k.role_title} phone={k.phone} whatsapp={k.whatsapp} email={k.contact_group === "emergency" ? null : k.email} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_17rem] flex-col">
          <SectionHeader icon={Users} title={s.isAdmin ? "Members" : myBlocks.length > 1 ? "Your blocks" : "Your block"} />
          {s.isAdmin || myBlocks.length ? (
            <ul className="flex flex-col gap-2">
              {(s.isAdmin ? blocks ?? [] : myBlocks).map((b: { building_id: string; building_name: string; units: number; people: number }) => (
                <li key={b.building_id} className="rounded-xl bg-surface-2 px-4 py-3">
                  <div className="font-medium">{b.building_name}</div>
                  <div className="text-sm text-muted">{b.units} flats · {b.people} {s.isAdmin ? "people" : "neighbours"}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-[0.9375rem] text-muted">You&apos;re not linked to a flat yet. The office can add you.</p>}
          <Link href={!s.isAdmin && myBlocks.length === 1 ? `${base}/members?block=${myBlocks[0].building_id}` : `${base}/members`}
            className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium no-underline hover:underline">
            {s.isAdmin ? "Open the member list" : "See your neighbours"} <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Card>
      </div>

      {notices.length > 0 && (
        <Card>
          <SectionHeader icon={Megaphone} title="Notices" />
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-3">
            {notices.map((n) => (
              <li key={n.title} className="rounded-xl bg-surface-2 p-4">
                <div className="text-sm text-muted">{date(n.date)}</div>
                <div className="mt-0.5 font-medium">{n.title}</div>
                <p className="mt-1 text-[0.9375rem] text-ink-2">{n.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="explore">
        <h2 id="explore" className="mb-3 text-[1.0625rem] font-semibold">Explore {s.community.name}</h2>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
          {shortcuts.map((x) => (
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
  );
}
