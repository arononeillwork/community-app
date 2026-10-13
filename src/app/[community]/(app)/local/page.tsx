import Link from "next/link";
import clsx from "clsx";
import { Accessibility, Check, Globe, MapPin, MapPinned, Navigation, Pencil, Phone, Plus, Route } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Empty, IconButton, Notice, PageHeader, buttonClass } from "@/components/ui";
import { telHref } from "@/components/contact";
import { FilterChips } from "@/components/library/FilterChips";
import {
  PLACE_TYPES, PLACE_TYPE_SINGULAR, PRICE_WORDS, directionsUrl, formatDistance, placeType, safeHttpUrl,
} from "@/components/library/meta";

export const metadata = { title: "Local area" };

type Place = {
  id: string; name: string; place_type: string; description: string | null; address: string | null;
  lat: number | null; lng: number | null; phone: string | null; website: string | null; distance_km: number | null;
  price_level: number | null; step_free: boolean | null; accessibility_notes: string | null; route_url: string | null;
};

const NOTICES: Record<string, string> = {
  suggested: "Thank you. Your place is now on the list for everyone.",
  saved: "Place saved.",
  deleted: "Place deleted.",
};

export default async function LocalPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ type?: string; stepfree?: string; suggested?: string; saved?: string; deleted?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;

  const [{ data: rows }, { data: suggesters }] = await Promise.all([
    supabase.from("local_places")
      .select("id, name, place_type, description, address, lat, lng, phone, website, distance_km, price_level, step_free, accessibility_notes, route_url")
      .eq("community_id", c),
    supabase.rpc("local_place_suggesters", { c }),
  ]);
  const suggestedBy = new Map(((suggesters ?? []) as { place_id: string; name: string }[]).map((x) => [x.place_id, x.name]));
  const all = ((rows ?? []) as Place[]).sort((a, b) =>
    (a.distance_km == null ? 1e9 : Number(a.distance_km)) - (b.distance_km == null ? 1e9 : Number(b.distance_km)) || a.name.localeCompare(b.name));

  // Filters live in the URL, so the chips are plain links.
  const stepFree = sp.stepfree === "1";
  const types = PLACE_TYPES.filter((t) => all.some((p) => p.place_type === t.key));
  const type = types.some((t) => t.key === sp.type) ? sp.type! : "";
  const pool = stepFree ? all.filter((p) => p.step_free) : all;
  const shown = type ? pool.filter((p) => p.place_type === type) : pool;
  const href = (t: string, sf: boolean) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (sf) q.set("stepfree", "1");
    return `${base}/local${q.size ? `?${q}` : ""}`;
  };

  // Rendered twice: inside the wrapping chip row on wider screens, on its own row under the scrolling chips on phones.
  const stepToggle = (display: string) => (
    <Link href={href(type, !stepFree)} scroll={false}
      className={clsx("min-h-10 w-fit shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] font-medium no-underline transition-colors",
        display,
        stepFree ? "bg-ok-soft text-ok ring-1 ring-inset ring-ok/40" : "bg-surface text-ink-2 ring-1 ring-inset ring-line hover:text-ink")}>
      {stepFree ? <Check aria-hidden className="size-4" /> : <Accessibility aria-hidden className="size-4" />}
      Step-free only<span className="sr-only">{stepFree ? " (on, select to show all)" : " (off)"}</span>
    </Link>
  );

  const noticeKey = ["suggested", "saved", "deleted"].find((k) => sp[k as keyof typeof sp]);
  const typeLabel = type ? placeType(type).label.toLowerCase() : "places";

  return (
    <>
      <PageHeader title="Local area" intro={`Walks, beaches, cafés and everyday places near ${s.community.name}.`}
        actions={s.isAdmin
          ? <Button href={`${base}/local/new`}><Plus aria-hidden className="size-4" /> Add a place</Button>
          : <Button href={`${base}/local/suggest`} variant="secondary"><Plus aria-hidden className="size-4" /> Suggest a place</Button>} />

      {noticeKey && <div className="mb-5"><Notice tone="ok">{NOTICES[noticeKey]}</Notice></div>}

      {all.length === 0 ? (
        <Empty title="No places yet" icon={MapPinned}
          action={<Button href={`${base}/local/${s.isAdmin ? "new" : "suggest"}`}>{s.isAdmin ? "Add a place" : "Suggest a place"}</Button>}>
          Share a favourite walk, café or shop with your neighbours.
        </Empty>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <FilterChips label="Type of place"
              chips={[
                { href: href("", stepFree), label: "All", active: !type, count: pool.length },
                ...types.map((t) => ({
                  href: href(t.key, stepFree), label: t.label, icon: t.icon, active: type === t.key,
                  count: pool.filter((p) => p.place_type === t.key).length,
                })),
              ]}
              after={<><span aria-hidden className="mx-1 hidden h-6 w-px self-center bg-line sm:block" />{stepToggle("hidden sm:inline-flex")}</>} />
            {stepToggle("inline-flex sm:hidden")}
          </div>

          {shown.length === 0 ? (
            <Empty title={`No step-free ${typeLabel} yet`} icon={Accessibility}
              action={<Button href={href(type, false)} variant="secondary">Show all {typeLabel}</Button>}>
              Know one? Suggest it so neighbours can find it.
            </Empty>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => {
                const t = placeType(p.place_type);
                const distance = formatDistance(p.distance_km);
                const website = safeHttpUrl(p.website);
                const route = safeHttpUrl(p.route_url);
                const who = suggestedBy.get(p.id);
                return (
                  <li key={p.id} id={`place-${p.id}`} className="flex scroll-mt-20 rounded-card target:ring-2 target:ring-brand">
                    <Card as="article" className="flex w-full flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                          <t.icon aria-hidden className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[1.0625rem] font-medium leading-snug">{p.name}</h2>
                          <p className="text-sm text-muted">
                            {PLACE_TYPE_SINGULAR[p.place_type] ?? t.label}
                            {distance && <> · {distance}</>}
                            {p.price_level ? <> · <span aria-hidden className="tabular">{"€".repeat(p.price_level)}</span><span className="sr-only">{PRICE_WORDS[p.price_level]}</span></> : null}
                          </p>
                        </div>
                        {s.isAdmin && <IconButton icon={Pencil} label={`Edit ${p.name}`} href={`${base}/local/${p.id}/edit`} className="-mr-2 -mt-1" />}
                      </div>

                      {p.description && <p className="text-[0.9375rem] text-ink-2">{p.description}</p>}

                      {(p.address || p.step_free || p.accessibility_notes) && (
                        <div className="flex flex-col gap-1 text-sm text-muted">
                          {p.address && (
                            <span className="flex items-start gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="min-w-0">{p.address}</span></span>
                          )}
                          {(p.step_free || p.accessibility_notes) && (
                            <span className="flex items-start gap-2">
                              <Accessibility aria-hidden className={clsx("mt-0.5 size-4 shrink-0", p.step_free && "text-ok")} />
                              <span className="min-w-0">
                                {p.step_free && <span className="font-medium text-ok">Step-free</span>}
                                {p.step_free && p.accessibility_notes && " · "}
                                {p.accessibility_notes}
                              </span>
                            </span>
                          )}
                        </div>
                      )}

                      {who && <p className="text-sm text-muted">Suggested by {who}</p>}

                      <div className="mt-auto flex flex-wrap gap-2 pt-1">
                        {p.phone && (
                          <a href={telHref(p.phone)} className={buttonClass("soft", "sm")} aria-label={`Call ${p.name} on ${p.phone}`}>
                            <Phone aria-hidden className="size-4" /> Call
                          </a>
                        )}
                        <a href={directionsUrl(p, s.community.info?.address)} target="_blank" rel="noopener noreferrer"
                          className={buttonClass("soft", "sm")} aria-label={`Directions to ${p.name} (opens Google Maps)`}>
                          <Navigation aria-hidden className="size-4" /> Directions
                        </a>
                        {route && (
                          <a href={route} target="_blank" rel="noopener noreferrer" className={buttonClass("soft", "sm")} aria-label={`Route map for ${p.name} (opens in a new tab)`}>
                            <Route aria-hidden className="size-4" /> Route
                          </a>
                        )}
                        {website && (
                          <a href={website} target="_blank" rel="noopener noreferrer" className={buttonClass("soft", "sm")} aria-label={`Website of ${p.name} (opens in a new tab)`}>
                            <Globe aria-hidden className="size-4" /> Website
                          </a>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
