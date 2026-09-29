import Link from "next/link";
import clsx from "clsx";
import {
  Accessibility, Coins, ExternalLink, Globe, Map as MapIcon, MapPin, Phone, Plus, Route as RouteIcon, Trash2,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import LinkButton from "@/components/info/LinkButton";
import { PLACE_TYPES, placeTypeLabel, priceWords, safeUrl, telHref } from "@/components/info/labels";
import SuggestPlaceForm from "./SuggestPlaceForm";
import { removePlace } from "./actions";

export const metadata = { title: "Local area" };

type Place = {
  id: string; name: string; place_type: string; description: string | null; address: string | null;
  lat: number | null; lng: number | null; phone: string | null; website: string | null;
  distance_km: number | string | null; price_level: number | null; step_free: boolean | null;
  accessibility_notes: string | null; route_url: string | null; recommended_by: string | null;
};

function mapUrl(p: Place, locality: string) {
  if (p.lat != null && p.lng != null) {
    return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
  }
  const where = [p.address || p.name, locality].filter(Boolean).join(", ");
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(where)}`;
}

function StepFree({ value }: { value: boolean | null }) {
  if (value === true) return <Badge tone="ok">Step-free access</Badge>;
  if (value === false) return <Badge tone="warn">Has steps</Badge>;
  return <Badge tone="neutral">Access not known</Badge>;
}

export default async function LocalPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { community } = await params;
  const { type } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const { data } = await supabase
    .from("local_places")
    .select("id, name, place_type, description, address, lat, lng, phone, website, distance_km, price_level, step_free, accessibility_notes, route_url, recommended_by")
    .eq("community_id", s.community.id)
    .order("distance_km", { ascending: true, nullsFirst: false })
    .order("name");
  const places = (data ?? []) as Place[];

  // Chips: known types in a fixed order, then anything else found in the data. Only types that have places.
  const counts = new Map<string, number>();
  for (const p of places) counts.set(p.place_type, (counts.get(p.place_type) ?? 0) + 1);
  const known = PLACE_TYPES.map((t) => t.value).filter((v) => counts.has(v));
  const extra = [...counts.keys()].filter((v) => !PLACE_TYPES.some((t) => t.value === v)).sort();
  const types = [...known, ...extra];
  const active = type && counts.has(type) ? type : "";
  const shown = active ? places.filter((p) => p.place_type === active) : places;

  // "29670 San Pedro de Alcántara, Málaga" from the community address, to make map searches find the right town.
  const locality = (s.community.info?.address ?? "").split(",").slice(1).join(",").trim();

  const chip = (value: string, text: string, n: number) => {
    const on = active === value;
    return (
      <li key={value || "all"}>
        <Link href={value ? `${base}/local?type=${encodeURIComponent(value)}` : `${base}/local`} scroll={false}
          aria-current={on ? "true" : undefined}
          className={clsx("inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-5 text-lg font-bold no-underline",
            on ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:border-brand")}>
          {text} <span className={clsx("tabular text-base", on ? "" : "text-muted")}>({n})</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="Local area"
        intro="Places near us that neighbours recommend: cafés, walks, shops, the pharmacy and more. Distances are from the building."
        actions={<LinkButton href="#suggest" variant="secondary"><Plus aria-hidden className="size-5" /> Suggest a place</LinkButton>} />

      {places.length === 0 ? (
        <Empty title="No places have been added yet.">Be the first: suggest a place below.</Empty>
      ) : (
        <>
          <nav aria-label="Show places of one type" className="no-print">
            <ul className="flex flex-wrap gap-2">
              {chip("", "All places", places.length)}
              {types.map((t) => chip(t, placeTypeLabel(t, true), counts.get(t) ?? 0))}
            </ul>
          </nav>

          <p className="text-muted" aria-live="polite">
            Showing <strong className="text-ink">{shown.length}</strong> {shown.length === 1 ? "place" : "places"}
            {active && <> of type <strong className="text-ink">{placeTypeLabel(active, true)}</strong></>}, nearest first.
          </p>

          <ul className="grid gap-4 md:grid-cols-2">
            {shown.map((p) => {
              const website = safeUrl(p.website);
              const route = safeUrl(p.route_url);
              const price = priceWords(p.price_level);
              const km = p.distance_km == null ? null : Number(p.distance_km);
              return (
                <li key={p.id} id={`place-${p.id}`} className="scroll-mt-32">
                  <Card as="article" className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="text-xl font-bold">{p.name}</h2>
                      <Badge tone="info">{placeTypeLabel(p.place_type)}</Badge>
                    </div>

                    {p.description && <p>{p.description}</p>}

                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {km != null && Number.isFinite(km) && (
                        <li className="flex items-center gap-1 font-bold"><MapPin aria-hidden className="size-5" /> <span className="tabular">{km.toLocaleString("en-GB")} km</span> away</li>
                      )}
                      {price && <li className="flex items-center gap-1"><Coins aria-hidden className="size-5" /> {price}</li>}
                      <li><StepFree value={p.step_free} /></li>
                      {p.recommended_by && <li><Badge tone="neutral">Suggested by a neighbour</Badge></li>}
                    </ul>

                    {p.accessibility_notes && (
                      <p className="flex items-start gap-2 rounded-xl bg-bg px-3 py-2">
                        <Accessibility aria-hidden className="mt-1 size-5 shrink-0" />
                        <span><span className="font-bold">Access: </span>{p.accessibility_notes}</span>
                      </p>
                    )}
                    {p.address && <p className="text-muted">{p.address}</p>}

                    <div className="no-print mt-auto flex flex-wrap gap-2 pt-2">
                      {p.phone && (
                        <LinkButton href={telHref(p.phone)}><Phone aria-hidden className="size-5" /> Call {p.phone}</LinkButton>
                      )}
                      <LinkButton href={mapUrl(p, locality)} external><MapIcon aria-hidden className="size-5" /> Open map</LinkButton>
                      {website && (
                        <LinkButton href={website} external><Globe aria-hidden className="size-5" /> Website</LinkButton>
                      )}
                      {route && (
                        <LinkButton href={route} external><RouteIcon aria-hidden className="size-5" /> Route</LinkButton>
                      )}
                    </div>

                    {s.isAdmin && (
                      <details className="no-print rounded-xl border border-line">
                        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-bold text-bad">
                          <Trash2 aria-hidden className="size-5" /> Remove this place (admin)
                        </summary>
                        <form action={removePlace.bind(null, s.community.slug, p.id)} className="flex flex-col gap-3 border-t border-line p-4">
                          <label className="flex min-h-12 items-center gap-3 font-bold">
                            <input type="checkbox" name="confirm" value="yes" required className="size-6 accent-[var(--bad)]" />
                            Yes, remove “{p.name}” for everyone
                          </label>
                          <button className="min-h-12 w-fit rounded-xl bg-bad px-5 font-bold text-white">Remove place</button>
                        </form>
                      </details>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="flex items-center gap-2 text-sm text-muted">
            <ExternalLink aria-hidden className="size-4" /> Maps, websites and routes open in a new tab.
          </p>
        </>
      )}

      <section id="suggest" aria-labelledby="suggest-heading" className="no-print scroll-mt-32">
        <Card className="flex flex-col gap-4">
          <div>
            <h2 id="suggest-heading" className="text-2xl font-bold">Suggest a place</h2>
            <p className="text-muted">Know a good café, a nice walk or a helpful shop? Tell your neighbours about it. It will appear in the list straight away.</p>
          </div>
          <SuggestPlaceForm slug={s.community.slug} />
        </Card>
      </section>
    </div>
  );
}
