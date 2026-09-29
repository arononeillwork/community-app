"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember } from "@/lib/community";
import { PLACE_TYPES, safeUrl } from "@/components/info/labels";

export type SuggestState = {
  ok?: boolean;
  error?: string;
  name?: string;
  /** What the person typed, so the form can be refilled after an error. */
  values?: Record<string, string>;
  /** Changes on every submit so the form fields are refreshed. */
  at?: number;
} | undefined;

const FIELDS = ["name", "place_type", "description", "address", "phone", "website", "distance_km", "step_free", "accessibility_notes"];

export async function suggestPlace(slug: string, _prev: SuggestState, form: FormData): Promise<SuggestState> {
  const s = await requireMember(slug);
  const supabase = await createClient();

  const values = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "").trim()]));
  const fail = (error: string): SuggestState => ({ error, values, at: Date.now() });

  const name = values.name;
  if (name.length < 2) return fail("Please write the name of the place.");
  if (name.length > 120) return fail("The name is too long. Please shorten it.");
  if (!PLACE_TYPES.some((p) => p.value === values.place_type)) return fail("Please choose what kind of place it is.");

  let website: string | null = null;
  if (values.website) {
    website = safeUrl(values.website);
    if (!website) return fail("The website address does not look right. Example: www.example.com");
  }

  const phone = values.phone || null;
  if (phone && !/^[+\d][\d\s().-]{2,24}$/.test(phone)) return fail("The phone number does not look right. Use only numbers, spaces and +.");

  let distance: number | null = null;
  if (values.distance_km) {
    distance = Number(values.distance_km.replace(",", "."));
    if (!Number.isFinite(distance) || distance < 0 || distance > 999) return fail("Please write the distance as a number of kilometres, for example 1.5");
    distance = Math.round(distance * 10) / 10;
  }

  const { error } = await supabase.from("local_places").insert({
    community_id: s.community.id,
    name,
    place_type: values.place_type,
    description: values.description.slice(0, 1000) || null,
    address: values.address.slice(0, 200) || null,
    phone,
    website,
    distance_km: distance,
    step_free: values.step_free === "yes" ? true : values.step_free === "no" ? false : null,
    accessibility_notes: values.accessibility_notes.slice(0, 500) || null,
    recommended_by: s.userId,
  });
  if (error) return fail("Sorry, your suggestion could not be saved. Please try again.");

  revalidatePath(`/${slug}/local`);
  return { ok: true, name, at: Date.now() };
}

/** Admins can remove a place (for example an unsuitable suggestion). Needs the confirmation box ticked. */
export async function removePlace(slug: string, id: string, form: FormData) {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return;
  const supabase = await createClient();
  await supabase.from("local_places").delete().eq("id", id).eq("community_id", s.community.id);
  revalidatePath(`/${slug}/local`);
}
