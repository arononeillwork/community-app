import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const COMMON = [
  "Gardening", "Pool maintenance", "Lift maintenance", "Cleaning", "Concierge", "Building insurance", "Property administration",
  "Electricity (common areas)", "Water", "General repairs", "Plumbing", "Electrician", "Security", "Pest control", "Painting",
];

/** Suggestions for the "Service" field: what this community already uses, then common services. */
export async function serviceTypes(supabase: SupabaseClient, communityId: string) {
  const { data } = await supabase.from("suppliers").select("service_type").eq("community_id", communityId);
  return Array.from(new Set([...(data ?? []).map((x) => x.service_type as string), ...COMMON])).sort((a, b) => a.localeCompare(b));
}
