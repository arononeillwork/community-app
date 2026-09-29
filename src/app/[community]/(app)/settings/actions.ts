"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/community";
import { syncPrefCookies } from "@/app/[community]/login/actions";

export type SettingsState = { error?: string; ok?: string } | undefined;

const FONT_SCALES = [100, 125, 150, 175, 200];
const SPEECH_RATES = [0.8, 1.0, 1.2];
const NOTIFY_CHANNELS = ["email", "whatsapp", "push"];
const CONTACT_METHODS = ["phone", "whatsapp", "email", "letter"];
const VISIBILITIES = ["admins", "unit", "all"];

const on = (form: FormData, key: string) => form.get(key) === "on";

/** Text size, contrast, font, motion, language, simple mode, notifications and voice. */
export async function saveDisplay(slug: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const s = await requireMember(slug);
  const supabase = await createClient();

  const fontScale = Number(form.get("font_scale"));
  if (!FONT_SCALES.includes(fontScale)) return { error: "Please choose a text size." };

  const languages = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  const language = String(form.get("language") ?? "");
  if (!languages.includes(language)) return { error: "Please choose a language from the list." };

  const notifyChannel = String(form.get("notify_channel") ?? "");
  if (!NOTIFY_CHANNELS.includes(notifyChannel)) return { error: "Please choose how you would like to get messages." };

  const speechRate = Number(form.get("speech_rate"));
  if (!SPEECH_RATES.includes(speechRate)) return { error: "Please choose a speaking speed." };

  const { error } = await supabase.from("user_preferences").upsert(
    {
      profile_id: s.userId,
      font_scale: fontScale,
      high_contrast: on(form, "high_contrast"),
      reduce_motion: on(form, "reduce_motion"),
      dyslexia_font: on(form, "dyslexia_font"),
      simple_mode: on(form, "simple_mode"),
      voice_enabled: on(form, "voice_enabled"),
      language,
      notify_channel: notifyChannel,
      speech_rate: speechRate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) return { error: "Your settings could not be saved. Please try again." };

  // Copy the new choices into cookies so the whole app (and the sign-in page) uses them straight away.
  await syncPrefCookies(s.userId);
  revalidatePath("/", "layout");
  return { ok: "Saved. Your new display settings are now in use." };
}

/** Name and phone number on the person's profile. */
export async function saveDetails(slug: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const s = await requireMember(slug);
  const supabase = await createClient();

  const fullName = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2) return { error: "Please enter your name." };
  if (fullName.length > 100) return { error: "Your name is too long. Please use 100 letters or fewer." };

  const phoneRaw = String(form.get("phone") ?? "").trim();
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "");
    if (!/^\+?[0-9\s().\-/]+$/.test(phoneRaw) || digits.length < 6 || digits.length > 15) {
      return { error: "That phone number does not look right. Please use numbers only, for example +34 600 123 456." };
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phoneRaw || null })
    .eq("id", s.userId)
    .select("id");
  if (error?.code === "42P17") {
    // Database policy problem (not something the resident can fix by trying again).
    return { error: "Changing your name and phone number is not working at the moment. Please ask the community office to update them for you." };
  }
  if (error || !data || data.length === 0) return { error: "Your details could not be saved. Please try again." };

  // Your name shows across the app (for example at the bottom of every page).
  revalidatePath("/", "layout");
  return { ok: "Saved. Your details are up to date." };
}

/** How the person likes to be contacted, and who can see their phone, email and best times. */
export async function saveSharing(slug: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const s = await requireMember(slug);
  const supabase = await createClient();

  const preferred = String(form.get("preferred_method") ?? "");
  if (!CONTACT_METHODS.includes(preferred)) return { error: "Please choose how you prefer to be contacted." };

  const visibility = String(form.get("visibility") ?? "");
  if (!VISIBILITIES.includes(visibility)) return { error: "Please choose who can see your contact details." };

  const bestTimes = String(form.get("best_times") ?? "").trim().replace(/\s+/g, " ");
  if (bestTimes.length > 120) return { error: "Please keep “best times” short (120 letters or fewer)." };

  const { error } = await supabase.from("contact_preferences").upsert(
    {
      profile_id: s.userId,
      community_id: s.community.id,
      preferred_method: preferred,
      best_times: bestTimes || null,
      visibility,
    },
    { onConflict: "profile_id,community_id" },
  );
  if (error) return { error: "Your choices could not be saved. Please try again." };

  revalidatePath(`/${slug}/settings`);
  revalidatePath(`/${slug}/contacts`);
  return { ok: "Saved. Other residents will now see your details as you chose." };
}
