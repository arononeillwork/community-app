import Link from "next/link";
import clsx from "clsx";
import { BookOpen, CalendarDays, ChevronDown, Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, humanize } from "@/lib/format";
import { inkFor } from "@/lib/color";
import { Badge, Button, Card, Empty, IconButton, Notice, PageHeader, SectionHeader } from "@/components/ui";
import RichText from "@/components/library/RichText";
import FaqList, { type Faq } from "@/components/library/FaqList";
import HashOpener from "@/components/library/HashOpener";
import FaqEditor from "./FaqEditor";
import { deleteFaq, updateFaq } from "./faq-actions";
import {
  INFO_CATEGORIES, VISIBILITY_LABELS, WEEK, infoIcon, listWords, todayAndTomorrow, weekdaysInWords, type Visibility,
} from "@/components/library/meta";

export const metadata = { title: "Bins & info" };

type Bin = {
  id: string; bin_type: string; color: string; color_hex: string; weekdays: number[];
  put_out_time: string | null; location: string | null; notes: string | null;
};
type InfoPage = { id: string; title: string; body: string; category: string; icon: string; visibility: Visibility; updated_at: string };

const NOTICES: Record<string, string> = {
  "saved:info": "Information saved.",
  "deleted:info": "Information deleted.",
  "saved:bin": "Bin days saved.",
  "deleted:bin": "Bin deleted.",
  "deleted:faq": "Question deleted. The assistant no longer uses it.",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function BinDot({ hex, className }: { hex: string; className?: string }) {
  return <span aria-hidden className={clsx("inline-block shrink-0 rounded-full ring-1 ring-inset ring-black/15", className ?? "size-3")} style={{ background: hex }} />;
}

export default async function InfoPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const { community } = await params;
  const { saved, deleted } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;

  // RLS hides owners-only and admins-only information from people who may not see it.
  const [{ data: binRows }, { data: pageRows }, { data: faqRows }] = await Promise.all([
    supabase.from("bin_schedules").select("id, bin_type, color, color_hex, weekdays, put_out_time, location, notes")
      .eq("community_id", c).order("sort").order("bin_type"),
    supabase.from("info_pages").select("id, title, body, category, icon, visibility, updated_at")
      .eq("community_id", c).order("sort").order("title"),
    supabase.from("faq_entries").select("id, question, answer").eq("community_id", c).order("created_at"),
  ]);
  const bins = (binRows ?? []) as Bin[];
  const pages = (pageRows ?? []) as InfoPage[];

  const known = INFO_CATEGORIES.map((x) => x.key);
  const groups = [
    ...INFO_CATEGORIES,
    ...[...new Set(pages.map((p) => p.category))].filter((k) => !known.includes(k)).map((k) => ({ key: k, label: humanize(k) })),
  ].map((g) => ({ ...g, items: pages.filter((p) => p.category === g.key) })).filter((g) => g.items.length > 0);

  const notice = NOTICES[saved ? `saved:${saved}` : deleted ? `deleted:${deleted}` : ""];

  return (
    <>
      <PageHeader title="Bins & info" intro="Bin days, house rules and what to do in an emergency." />
      {notice && <div className="mb-5"><Notice tone="ok">{notice}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {bins.length === 0 ? (
            <Empty title="No bin days yet" icon={Trash2}
              action={s.isAdmin ? <Button href={`${base}/info/bins/new`} size="sm">Add a bin</Button> : undefined}>
              {s.isAdmin ? "Add each bin with its colour and collection days." : "The office will add the bin days here."}
            </Empty>
          ) : (
            <>
              <BinWeek bins={bins} timeZone={s.community.timezone} />
              <BinTypes bins={bins} base={base} isAdmin={s.isAdmin} />
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
        {groups.length === 0 ? (
          <Empty title="No building information yet" icon={BookOpen}
            action={s.isAdmin ? <Button href={`${base}/info/pages/new`} size="sm">Add information</Button> : undefined}>
            {s.isAdmin ? "Add house rules, pool hours, parking and emergency steps." : "The office will add house rules, pool hours and parking here."}
          </Empty>
        ) : (
          <BuildingInfo groups={groups} base={base} isAdmin={s.isAdmin} timeZone={s.community.timezone} />
        )}
          <FaqList items={(faqRows ?? []) as Faq[]}
            description={s.isAdmin ? "The assistant answers from these. Open one to edit or delete it." : undefined}
            renderAnswer={s.isAdmin ? (f, answer) => (
              <FaqEditor question={f.question} answer={f.answer}
                update={updateFaq.bind(null, s.community.slug, f.id)} remove={deleteFaq.bind(null, s.community.slug, f.id)}>
                {answer}
              </FaqEditor>
            ) : undefined} />
        </div>
      </div>
      <HashOpener />
    </>
  );
}

/** Monday to Sunday with a dot per bin; today and tomorrow (in the community's time zone) highlighted and spelled out. */
function BinWeek({ bins, timeZone }: { bins: Bin[]; timeZone: string }) {
  const { today, tomorrow } = todayAndTomorrow(timeZone);
  const on = (day: number) => bins.filter((b) => b.weekdays.includes(day));
  const dayName = (day: number) => WEEK.find((d) => d.value === day)!.long;
  return (
    <Card>
      <SectionHeader icon={CalendarDays} title="Bin collection" description="The same days every week" />
      <ol aria-label="Collection days" className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEK.map((d) => {
          const list = on(d.value);
          const isToday = d.value === today;
          const isTomorrow = d.value === tomorrow;
          return (
            <li key={d.value}
              className={clsx("flex min-w-0 flex-col items-center gap-2.5 rounded-xl px-0.5 pb-3 pt-2.5",
                isToday ? "bg-brand-soft ring-2 ring-inset ring-brand" : isTomorrow ? "ring-1 ring-inset ring-brand-line" : "")}>
              <span aria-hidden className={clsx("text-sm", isToday || isTomorrow ? "font-medium text-brand-text" : "text-muted")}>{d.short}</span>
              <span aria-hidden className="flex flex-col items-center gap-1.5">
                {list.map((b) => <BinDot key={b.id} hex={b.color_hex} className="size-3.5" />)}
                {list.length === 0 && <span className="text-sm text-muted">–</span>}
              </span>
              <span className="sr-only">
                {d.long}{isToday ? ", today" : isTomorrow ? ", tomorrow" : ""}: {list.length ? listWords(list.map((b) => b.bin_type)) : "no collection"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[{ day: today, label: "Today" }, { day: tomorrow, label: "Tomorrow" }].map(({ day, label }) => (
          <div key={label} className={clsx("rounded-xl px-4 py-3", label === "Today" ? "bg-brand-soft" : "bg-surface-2")}>
            <div className="text-sm text-muted"><span className="font-medium text-ink">{label}</span> · {dayName(day)}</div>
            {on(day).length ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {on(day).map((b) => (
                  <li key={b.id} className="flex items-center gap-2.5 text-[0.9375rem] text-ink-2">
                    <BinDot hex={b.color_hex} />{b.bin_type}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1.5 text-[0.9375rem] text-muted">No collection</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One row per bin: colour swatch, name, colour word, days in words, when and where to put it out, a tip. */
function BinTypes({ bins, base, isAdmin }: { bins: Bin[]; base: string; isAdmin: boolean }) {
  return (
    <Card padded={false}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={Trash2} title="Bin types" description="What goes where, and when"
          action={isAdmin ? <Button href={`${base}/info/bins/new`} variant="ghost" size="sm"><Plus aria-hidden className="size-4" /> Add bin</Button> : undefined} />
      </div>
      <ul className="divide-y divide-line">
        {bins.map((b) => (
          <li key={b.id} className="flex gap-4 px-5 py-4 sm:px-6">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/10"
              style={{ background: b.color_hex, color: inkFor(b.color_hex) }}>
              <Trash2 className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{b.bin_type}</span>
                <span className="text-[0.9375rem] text-muted">{cap(b.color)} bin</span>
              </div>
              <div className="text-[0.9375rem] text-ink-2">{weekdaysInWords(b.weekdays)}</div>
              {(b.put_out_time || b.location) && (
                <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-4">
                  {b.put_out_time && <span className="inline-flex items-center gap-1.5"><Clock aria-hidden className="size-3.5 shrink-0" />Put out: {b.put_out_time}</span>}
                  {b.location && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="size-3.5 shrink-0" />{b.location}</span>}
                </div>
              )}
              {b.notes && <p className="mt-1 text-sm text-muted">{b.notes}</p>}
            </div>
            {isAdmin && <IconButton icon={Pencil} label={`Edit ${b.bin_type}`} href={`${base}/info/bins/${b.id}/edit`} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Expandable topics grouped Emergency, Rules, Facilities, Parking, General; the first emergency topic starts open. */
function BuildingInfo({ groups, base, isAdmin, timeZone }: {
  groups: { key: string; label: string; items: InfoPage[] }[]; base: string; isAdmin: boolean; timeZone: string;
}) {
  const firstEmergency = groups.find((g) => g.key === "emergency")?.items.find((p) => p.visibility === "all")?.id;
  return (
    <Card padded={false} className="min-w-0">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <SectionHeader className="mb-0" icon={BookOpen} title="Building information" description="Tap a topic to read it"
          action={isAdmin ? <Button href={`${base}/info/pages/new`} variant="ghost" size="sm"><Plus aria-hidden className="size-4" /> Add</Button> : undefined} />
      </div>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`cat-${g.key}`} className="border-t border-line">
          <h3 id={`cat-${g.key}`} className="px-5 pb-1 pt-4 text-sm font-medium text-muted sm:px-6">{g.label}</h3>
          <div className="divide-y divide-line">
            {g.items.map((p) => {
              const Icon = infoIcon(p.icon);
              const urgent = p.category === "emergency";
              return (
                <details key={p.id} id={`info-${p.id}`} className="group scroll-mt-20" open={p.id === firstEmergency}>
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl", urgent ? "bg-bad-soft text-bad" : "bg-brand-soft text-brand-text")}>
                      <Icon aria-hidden className="size-[1.15rem]" />
                    </span>
                    {/* Title and "Owners only" wrap onto two lines with large text instead of pushing the page sideways. */}
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 font-medium leading-snug text-ink">{p.title}</span>
                      {p.visibility !== "all" && (
                        <Badge tone={p.visibility === "admins" ? "warn" : "neutral"} dot={false}>{VISIBILITY_LABELS[p.visibility]}</Badge>
                      )}
                    </span>
                    <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 pt-1 sm:pl-[4.5rem] sm:pr-6">
                    <RichText text={p.body} headingAs="h4" />
                    {isAdmin && (
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span>Updated {date(p.updated_at, timeZone)}</span>
                        <Link href={`${base}/info/pages/${p.id}/edit`} className="inline-flex items-center gap-1 font-medium no-underline hover:underline">
                          <Pencil aria-hidden className="size-3.5" /> Edit<span className="sr-only"> {p.title}</span>
                        </Link>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ))}
    </Card>
  );
}
