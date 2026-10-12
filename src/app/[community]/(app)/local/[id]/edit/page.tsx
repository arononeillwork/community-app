import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageHeader } from "@/components/ui";
import ConfirmDelete from "@/components/library/ConfirmDelete";
import { UUID_RE } from "@/components/library/meta";
import PlaceForm from "../../PlaceForm";
import { deletePlace } from "../../actions";

export const metadata = { title: "Edit place" };

const str = (v: unknown) => (v == null ? "" : String(v));

export default async function EditPlacePage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const [{ data: p }, { data: suggesters }] = await Promise.all([
    supabase.from("local_places")
      .select("id, name, place_type, description, address, lat, lng, phone, website, distance_km, price_level, step_free, accessibility_notes, route_url")
      .eq("id", id).eq("community_id", c).maybeSingle(),
    supabase.rpc("local_place_suggesters", { c }),
  ]);
  if (!p) notFound();
  const who = ((suggesters ?? []) as { place_id: string; name: string }[]).find((x) => x.place_id === p.id)?.name;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit place" intro={p.name} back={{ href: `/${s.community.slug}/local`, label: "Local area" }} />
      <div className="flex flex-col gap-5">
        {who && <Notice tone="info">Suggested by {who}. Your changes keep their name on it.</Notice>}
        <PlaceForm slug={s.community.slug} id={p.id} mode="admin"
          initial={{
            name: p.name, place_type: p.place_type, description: str(p.description), address: str(p.address), phone: str(p.phone),
            website: str(p.website), price_level: str(p.price_level), step_free: p.step_free === true ? "yes" : p.step_free === false ? "no" : "",
            accessibility_notes: str(p.accessibility_notes), route_url: str(p.route_url), distance_km: str(p.distance_km),
            lat: str(p.lat), lng: str(p.lng),
          }} />
        <ConfirmDelete action={deletePlace.bind(null, s.community.slug, p.id)} title="Delete place"
          description="Residents will no longer see it." label="Delete place" question={`Delete “${p.name}”? This cannot be undone.`} />
      </div>
    </div>
  );
}
