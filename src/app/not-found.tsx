import { createClient } from "@/lib/supabase/server";
import NotFoundView from "@/components/admin/NotFoundView";

/**
 * Site-wide "not found". Unknown community addresses end up here too (the community layout
 * calls notFound() before its own not-found boundary exists), so the view tells the two apart:
 * "We couldn't find that page" / "We couldn't find that community".
 */
export default async function NotFound() {
  const supabase = await createClient();
  const { data } = await supabase.from("communities").select("slug, name").eq("status", "active").order("name");
  const communities = (data ?? []).map((c) => ({ slug: String(c.slug), name: String(c.name) }));
  return <NotFoundView communities={communities} />;
}
