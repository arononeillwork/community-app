import { createClient } from "@/lib/supabase/server";
import NotFoundView from "@/components/admin/NotFoundView";

/**
 * "Not found" inside the community segment (shown in the community's colours).
 * If the community in the address does not exist the view says "We couldn't find that community";
 * if the community exists but the page does not, it says "We couldn't find that page" and links to
 * that community's home.
 */
export default async function CommunityNotFound() {
  const supabase = await createClient();
  const { data } = await supabase.from("communities").select("slug, name").eq("status", "active").order("name");
  const communities = (data ?? []).map((c) => ({ slug: String(c.slug), name: String(c.name) }));
  return <NotFoundView communities={communities} />;
}
