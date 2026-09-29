import {
  Building2, Car, ChevronDown, Clock, Info, MapPin, ScrollText, Siren, Trash2, Truck, Waves, type LucideIcon,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import EmergencyBox from "@/components/info/EmergencyBox";
import BinWeekTable, { Swatch } from "@/components/info/BinWeekTable";
import OpenFromHash from "@/components/info/OpenFromHash";
import { DAY_NAMES, binDaysWords, capitalise, isEveryDay, weekdayIn, type Bin } from "@/components/info/labels";

export const metadata = { title: "Bins & building info" };

type InfoRow = { id: string; title: string; body: string; category: string; icon: string; sort: number; updated_at: string };

const ICONS: Record<string, LucideIcon> = {
  siren: Siren, emergency: Siren,
  "scroll-text": ScrollText, rules: ScrollText,
  waves: Waves, facilities: Waves,
  car: Car, parking: Car,
  building: Building2, truck: Truck,
  info: Info, general: Info,
};

export default async function InfoPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const tz = s.community.timezone;

  const [{ data: binData }, { data: pageData }] = await Promise.all([
    supabase.from("bin_schedules")
      .select("id, bin_type, color, color_hex, weekdays, put_out_time, location, notes")
      .eq("community_id", s.community.id).order("sort"),
    // RLS only returns pages this person may see (visibility).
    supabase.from("info_pages")
      .select("id, title, body, category, icon, sort, updated_at")
      .eq("community_id", s.community.id).order("sort"),
  ]);

  const bins = ((binData ?? []) as Bin[]).map((b) => ({ ...b, weekdays: Array.isArray(b.weekdays) ? b.weekdays : [] }));
  const pages = ((pageData ?? []) as InfoRow[])
    .slice()
    .sort((a, b) => Number(b.category === "emergency") - Number(a.category === "emergency") || a.sort - b.sort);

  const tomorrow = weekdayIn(tz, 1);
  const binsTomorrow = bins.filter((b) => b.weekdays.includes(tomorrow));
  const info = s.community.info;
  const officeHours = Array.isArray(info?.office_hours) ? info.office_hours : [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <OpenFromHash />
      <PageHeader title="Bins & building info"
        intro="Emergency numbers, which bin goes out on which day, and the house rules." />

      <EmergencyBox contacts={info?.emergency_contacts} />

      {/* Tomorrow highlight */}
      <section aria-labelledby="tomorrow-heading" className="rounded-card border-2 border-brand bg-brand-soft p-5 sm:p-6">
        <h2 id="tomorrow-heading" className="mb-3 flex items-center gap-2 text-2xl font-bold">
          <Trash2 aria-hidden className="size-7" /> Tomorrow, {DAY_NAMES[tomorrow]}
        </h2>
        {binsTomorrow.length === 0 ? (
          <p className="text-lg">No bins are collected tomorrow.</p>
        ) : (
          <>
            <p className="mb-3 text-lg">These bins are collected tomorrow:</p>
            <ul className="flex flex-col gap-3">
              {binsTomorrow.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-3">
                  <Swatch hex={b.color_hex} className="size-8" />
                  <span className="text-lg font-bold">{b.bin_type}</span>
                  <span className="text-muted">({capitalise(b.color)} bin{isEveryDay(b) ? ", every day" : ""})</span>
                  {b.put_out_time && (
                    <span className="flex items-center gap-1 sm:ml-auto">
                      <Clock aria-hidden className="size-5" /> Put out: {b.put_out_time}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Week grid */}
      <section id="bins" aria-labelledby="bins-heading" className="flex scroll-mt-32 flex-col gap-4">
        <div>
          <h2 id="bins-heading" className="text-2xl font-bold">Which bin, which day</h2>
          <p className="text-muted">A tick means the bin is collected that day. Tomorrow&apos;s column is highlighted.</p>
        </div>
        {bins.length === 0 ? (
          <Empty title="No bin days have been added yet.">Please ask the community office.</Empty>
        ) : (
          <>
            <BinWeekTable bins={bins} tomorrow={tomorrow} />
            <ul className="grid gap-4 md:grid-cols-2">
              {bins.map((b) => (
                <li key={b.id}>
                  <Card as="article" className="h-full">
                    <h3 className="mb-3 flex items-center gap-3 text-xl font-bold">
                      <Swatch hex={b.color_hex} className="size-8" />
                      <span>{b.bin_type} <span className="font-normal text-muted">({capitalise(b.color)} bin)</span></span>
                    </h3>
                    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
                      <dt className="font-bold">Collected</dt><dd>{binDaysWords(b)}</dd>
                      {b.put_out_time && (<><dt className="font-bold">Put out</dt><dd>{b.put_out_time}</dd></>)}
                      {b.location && (<><dt className="font-bold">Where</dt><dd>{b.location}</dd></>)}
                      {b.notes && (<><dt className="font-bold">Good to know</dt><dd>{b.notes}</dd></>)}
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Office hours */}
      {(officeHours.length > 0 || info?.address) && (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold"><Clock aria-hidden className="size-7" /> Opening hours</h2>
          {officeHours.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              {officeHours.map((o) => (
                <div key={`${o.label}-${o.hours}`} className="contents">
                  <dt className="font-bold">{o.label}</dt><dd className="tabular">{o.hours}</dd>
                </div>
              ))}
            </dl>
          )}
          {info?.address && (
            <p className="mt-3 flex items-start gap-2"><MapPin aria-hidden className="mt-1 size-5 shrink-0" /> {info.address}</p>
          )}
        </Card>
      )}

      {/* Info pages */}
      <section aria-labelledby="pages-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="pages-heading" className="text-2xl font-bold">House rules and building information</h2>
          <p className="text-muted">Tap a heading to open it.</p>
        </div>
        {pages.length === 0 ? (
          <Empty title="No information pages yet." />
        ) : (
          <div className="flex flex-col gap-3">
            {pages.map((p) => {
              const Icon = ICONS[p.icon] ?? ICONS[p.category] ?? Info;
              const emergency = p.category === "emergency";
              return (
                <details key={p.id} id={`info-${p.id}`} open={emergency}
                  className={`group scroll-mt-32 rounded-card border-2 bg-surface ${emergency ? "border-bad/50" : "border-line"}`}>
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-card px-5 py-4 text-xl font-bold hover:bg-bg [&::-webkit-details-marker]:hidden">
                    <Icon aria-hidden className={`size-7 shrink-0 ${emergency ? "text-bad" : "text-brand"}`} />
                    <span className="flex-1">{p.title}</span>
                    <span aria-hidden className="flex items-center gap-1 text-base text-brand">
                      <span className="group-open:hidden">Open</span>
                      <span className="hidden group-open:inline">Close</span>
                      <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="border-t border-line px-5 py-4">
                    <p className="whitespace-pre-line text-lg">{p.body}</p>
                    <p className="mt-3 text-sm text-muted">Last updated {date(p.updated_at)}</p>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
