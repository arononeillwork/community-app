import { requireMember } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import PlaceForm from "../PlaceForm";

export const metadata = { title: "Suggest a place" };

/** How neighbours see the suggester's name ("Sophie M."), matching local_place_suggesters(). */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export default async function SuggestPlacePage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const name = shortName(s.fullName);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Suggest a place" back={{ href: `/${s.community.slug}/local`, label: "Local area" }}
        intro={name ? `A walk, café or shop you like. Neighbours will see “Suggested by ${name}”` : "A walk, café or shop you like. Your name is shown with it."} />
      <PlaceForm slug={s.community.slug} id={null} mode="suggest"
        initial={{
          name: "", place_type: "", description: "", address: "", phone: "", website: "", price_level: "", step_free: "",
          accessibility_notes: "", route_url: "", distance_km: "", lat: "", lng: "",
        }} />
    </div>
  );
}
