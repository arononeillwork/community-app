"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { syncPrefCookies } from "../../login/actions";
import type { FormState } from "@/components/me/forms";
import { CHANNELS, METHODS, SCALES, THEMES, VISIBILITIES, cleanPhone } from "./options";

const FAILED = "That could not be saved. Please try again.";

/** Reading and display: saved to user_preferences and copied into the cookies the root layout reads. */
export async function saveDisplay(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const font_scale = Number(form.get("font_scale"));
  const theme = String(form.get("theme") ?? "");
  const language = String(form.get("language") ?? "");
  if (!SCALES.includes(font_scale)) return { error: "Please choose a text size." };
  if (!THEMES.some((t) => t.value === theme)) return { error: "Please choose light, dark or match my device." };
  if (!s.community.enabled_languages.includes(language)) return { error: "Please choose one of the languages in the list." };

  const supabase = await createClient();
  const { error } = await supabase.from("user_preferences").upsert({
    profile_id: s.userId,
    font_scale,
    theme,
    language,
    high_contrast: form.get("high_contrast") === "on",
    dyslexia_font: form.get("dyslexia_font") === "on",
    reduce_motion: form.get("reduce_motion") === "on",
    updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id" });
  if (error) return { error: FAILED };

  await syncPrefCookies(s.userId);
  revalidatePath(`/${slug}`, "layout");
  return { ok: true, message: "Saved. Every page now uses these settings." };
}

/** Name and phone on the person's own profile. Email is the sign-in address and is not changed here. */
export async function saveDetails(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const full_name = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const phoneRaw = String(form.get("phone") ?? "").trim();
  if (full_name.length < 2 || full_name.length > 80) return { error: "Please enter your full name." };
  const phone = phoneRaw ? cleanPhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "Please check the phone number. Include the country code, for example +34 600 123 456." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", s.userId).select("id");
  if (error || !data?.length) return { error: FAILED };

  revalidatePath(`/${slug}`, "layout");
  return { ok: true, message: "Saved." };
}

/** Who may see my phone and email, and how I like to be contacted. */
export async function saveSharing(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const preferred_method = String(form.get("preferred_method") ?? "");
  const visibility = String(form.get("visibility") ?? "");
  const best_times = String(form.get("best_times") ?? "").trim().replace(/\s+/g, " ");
  if (!METHODS.some((m) => m.value === preferred_method)) return { error: "Please choose how you prefer to be contacted." };
  if (!VISIBILITIES.some((v) => v.value === visibility)) return { error: "Please choose who can see your details." };
  if (best_times.length > 80) return { error: "Please keep the best times short (80 characters at most)." };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_preferences").upsert({
    profile_id: s.userId,
    community_id: s.community.id,
    preferred_method,
    best_times: best_times || null,
    visibility,
  }, { onConflict: "profile_id,community_id" });
  if (error) return { error: FAILED };

  revalidatePath(`/${slug}`, "layout");
  if (preferred_method === "phone" || preferred_method === "whatsapp") {
    const { data: me } = await supabase.from("profiles").select("phone").eq("id", s.userId).single();
    if (!me?.phone) return { ok: true, message: "Saved. Add your phone number under Your details so people can reach you that way." };
  }
  return { ok: true, message: "Saved." };
}

/** Where alerts go. They always appear under the bell as well. */
export async function saveNotify(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  const notify_channel = String(form.get("notify_channel") ?? "");
  if (!CHANNELS.some((c) => c.value === notify_channel)) return { error: "Please choose where to send your alerts." };

  const supabase = await createClient();
  if (notify_channel === "whatsapp") {
    const { data: me } = await supabase.from("profiles").select("phone").eq("id", s.userId).single();
    if (!me?.phone) return { error: "Add your phone number under Your details first, so we know where to send WhatsApp messages." };
  }
  const { error } = await supabase.from("user_preferences").upsert(
    { profile_id: s.userId, notify_channel, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" },
  );
  if (error) return { error: FAILED };

  revalidatePath(`/${slug}/settings`);
  return { ok: true, message: "Saved." };
}
