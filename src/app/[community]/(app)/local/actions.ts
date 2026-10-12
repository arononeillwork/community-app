"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PLACE_TYPE_KEYS, UUID_RE } from "@/components/library/meta";

export type PlaceField =
  | "name" | "place_type" | "description" | "address" | "phone" | "website" | "price_level" | "step_free"
  | "accessibility_notes" | "route_url" | "distance_km" | "lat" | "lng";
export type PlaceFormState = { error?: string; fields?: Partial<Record<PlaceField, string>> } | undefined;
export type DeleteResult = { error?: string } | void;

const PRICED = ["restaurant", "cafe"];
const PHONE = /^\+?[\d\s().\-/]+$/;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const oneLine = (v: string) => v.replace(/\s+/g, " ");

function validPhone(v: string) {
  const digits = v.replace(/\D/g, "").length;
  return v.length <= 30 && PHONE.test(v) && digits >= 3 && digits <= 15;
}

/** "www.example.es" → "https://www.example.es". Returns null for anything that is not a plain web link. */
function webUrl(v: string) {
  if (!v) return { value: null, ok: true };
  const withScheme = /^https?:\/\//i.test(v) ? v : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? `https://${v}` : v;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".") || withScheme.length > 500) return { value: null, ok: false };
    return { value: u.toString(), ok: true };
  } catch {
    return { value: null, ok: false };
  }
}

function num(v: string) {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Read and check the form. Coordinates and distance are only taken from administrators. */
function readPlace(form: FormData, admin: boolean) {
  const name = oneLine(text(form, "name"));
  const place_type = text(form, "place_type");
  const description = oneLine(text(form, "description"));
  const address = oneLine(text(form, "address")) || null;
  const phone = oneLine(text(form, "phone")) || null;
  const website = webUrl(text(form, "website"));
  const route = webUrl(text(form, "route_url"));
  const priceText = text(form, "price_level");
  const stepText = text(form, "step_free");
  const accessibility_notes = oneLine(text(form, "accessibility_notes")) || null;

  const f: Partial<Record<PlaceField, string>> = {};
  if (name.length < 2 || name.length > 80) f.name = "Use 2 to 80 characters.";
  if (!PLACE_TYPE_KEYS.includes(place_type)) f.place_type = "Choose what kind of place it is.";
  if (description.length < 10) f.description = "Say in a sentence why it is worth a visit.";
  else if (description.length > 280) f.description = "Keep it under 280 characters.";
  if (address && address.length > 120) f.address = "Keep the address under 120 characters.";
  if (phone && !validPhone(phone)) f.phone = "Use digits and spaces, with + for the country code, e.g. +34 952 111 222.";
  if (!website.ok) f.website = "Use a web address such as https://example.es.";
  if (!route.ok) f.route_url = "Use a web address, for example a Google Maps or Wikiloc link.";
  if (accessibility_notes && accessibility_notes.length > 200) f.accessibility_notes = "Keep it under 200 characters.";

  let price_level: number | null = null;
  if (PRICED.includes(place_type) && priceText) {
    price_level = Number(priceText);
    if (!Number.isInteger(price_level) || price_level < 1 || price_level > 4) f.price_level = "Choose a price level.";
  }
  if (!["", "yes", "no"].includes(stepText)) f.step_free = "Choose yes, no or not sure.";
  const step_free = stepText === "yes" ? true : stepText === "no" ? false : null;

  let extra: { distance_km: number | null; lat: number | null; lng: number | null } | Record<string, never> = {};
  if (admin) {
    const distance_km = num(text(form, "distance_km"));
    const lat = num(text(form, "lat"));
    const lng = num(text(form, "lng"));
    if (distance_km !== null && (Number.isNaN(distance_km) || distance_km < 0 || distance_km > 999)) f.distance_km = "Use kilometres from 0 to 999, e.g. 0.4.";
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) f.lat = "Latitude is a number from -90 to 90.";
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) f.lng = "Longitude is a number from -180 to 180.";
    if ((lat === null) !== (lng === null) && !f.lat && !f.lng) f[lat === null ? "lat" : "lng"] = "Add both latitude and longitude, or neither.";
    extra = {
      distance_km: distance_km === null ? null : Math.round(distance_km * 10) / 10,
      lat: lat === null ? null : Math.round(lat * 1e6) / 1e6,
      lng: lng === null ? null : Math.round(lng * 1e6) / 1e6,
    };
  }

  const row = {
    name, place_type, description, address, phone, website: website.value, route_url: route.value,
    price_level, step_free, accessibility_notes, ...extra,
  };
  return { row, fields: f };
}

/** A resident suggests a place. It is shown to everyone with their name (RLS checks recommended_by = the user). */
export async function suggestPlace(slug: string, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  const s = await requireMember(slug);
  const { row, fields } = readPlace(form, false);
  if (Object.keys(fields).length) return { error: "Please check the highlighted fields.", fields };
  const supabase = await createClient();
  const { error } = await supabase.from("local_places").insert({ ...row, community_id: s.community.id, recommended_by: s.userId });
  if (error) return { error: "Your suggestion could not be saved. Please try again." };
  revalidatePath(`/${slug}/local`);
  redirect(`/${slug}/local?suggested=1`);
}

/** Create (id = null) or update a place. Admins only. */
export async function savePlace(slug: string, id: string | null, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  const s = await requireAdmin(slug);
  if (id !== null && !UUID_RE.test(id)) return { error: "This place no longer exists. It may have been deleted." };
  const { row, fields } = readPlace(form, true);
  if (Object.keys(fields).length) return { error: "Please check the highlighted fields.", fields };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("local_places").update(row).eq("id", id).eq("community_id", s.community.id).select("id");
    if (error) return { error: "The place could not be saved. Please try again." };
    if (!data?.length) return { error: "This place no longer exists. It may have been deleted." };
  } else {
    const { error } = await supabase.from("local_places").insert({ ...row, community_id: s.community.id });
    if (error) return { error: "The place could not be saved. Please try again." };
  }
  revalidatePath(`/${slug}/local`);
  redirect(`/${slug}/local?saved=1`);
}

export async function deletePlace(slug: string, id: string): Promise<DeleteResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This place no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("local_places").delete().eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The place could not be deleted. Please try again." };
  if (!data?.length) return { error: "This place no longer exists. It may already have been deleted." };
  revalidatePath(`/${slug}/local`);
  redirect(`/${slug}/local?deleted=1`);
}
