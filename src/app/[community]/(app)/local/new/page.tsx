import { requireAdmin } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import PlaceForm from "../PlaceForm";

export const metadata = { title: "Add a place" };

export default async function NewPlacePage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a place" intro="Somewhere residents will want to go, with how to get there."
        back={{ href: `/${s.community.slug}/local`, label: "Local area" }} />
      <PlaceForm slug={s.community.slug} id={null} mode="admin"
        initial={{
          name: "", place_type: "", description: "", address: "", phone: "", website: "", price_level: "", step_free: "",
          accessibility_notes: "", route_url: "", distance_km: "", lat: "", lng: "",
        }} />
    </div>
  );
}
