"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { isAccessibleBrand } from "@/lib/color";
import { parseEurosToCents } from "@/lib/format";
import { HEX, suggestAccessible } from "@/components/admin/brand";
import { LANGUAGES } from "@/components/admin/format";

export type CommunityFormState = { error?: string } | undefined;

const PHONE = /^\+?[0-9 ()./-]{2,24}$/;
// https:// addresses, or a path on this site ("/communities/…"); not protocol-relative "//host/…".
const URL_OK = /^(https:\/\/[^\s"'()<>\\]+|\/(?!\/)[^\s"'()<>\\]+)$/;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function all(form: FormData, key: string) {
  return form.getAll(key).map((v) => String(v).trim());
}

function isDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function coordinate(v: string, limit: number) {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e6) / 1e6 : undefined;
}

function done(slug: string, section: string) {
  // Branding, name and landing text show on every page of the community.
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/admin/community?saved=${section}#${section}`);
}

// ---------------------------------------------------------------------------
// Landing page (community_public_info)
// ---------------------------------------------------------------------------
export async function savePublicInfo(slug: string, _prev: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const c = s.community;

  // Keep text in languages that are not enabled any more; replace the enabled ones.
  const tagline: Record<string, string> = { ...(c.info?.tagline ?? {}) };
  const welcome: Record<string, string> = { ...(c.info?.welcome ?? {}) };
  for (const lang of c.enabled_languages) {
    const t = text(form, `tagline_${lang}`).replace(/\s+/g, " ");
    const w = text(form, `welcome_${lang}`);
    if (t.length > 120) return { error: "Please keep each tagline under 120 characters." };
    if (w.length > 1500) return { error: "Please keep each welcome text under 1,500 characters." };
    if (t) tagline[lang] = t; else delete tagline[lang];
    if (w) welcome[lang] = w; else delete welcome[lang];
  }
  if (!tagline[c.default_language] && !welcome[c.default_language]) {
    return { error: "Please write at least the tagline or welcome text in the main language." };
  }

  const address = text(form, "address").replace(/\s+/g, " ");
  if (address.length > 200) return { error: "Please keep the address under 200 characters." };
  const lat = coordinate(text(form, "lat"), 90);
  const lng = coordinate(text(form, "lng"), 180);
  if (lat === undefined) return { error: "Latitude must be a number between -90 and 90, for example 36.4843." };
  if (lng === undefined) return { error: "Longitude must be a number between -180 and 180, for example -4.9906." };
  if ((lat == null) !== (lng == null)) return { error: "Please enter both latitude and longitude, or leave both empty." };

  const hoursLabels = all(form, "oh_label"), hoursValues = all(form, "oh_hours");
  const office_hours: { label: string; hours: string }[] = [];
  for (let i = 0; i < hoursLabels.length; i++) {
    const label = hoursLabels[i] ?? "", hours = hoursValues[i] ?? "";
    if (!label && !hours) continue;
    if (!label || !hours) return { error: "Each opening-hours row needs both a name and the hours." };
    if (label.length > 60 || hours.length > 80) return { error: "Please keep opening hours short." };
    office_hours.push({ label, hours });
  }

  const numLabels = all(form, "ec_label"), numPhones = all(form, "ec_phone");
  const emergency_contacts: { label: string; phone: string }[] = [];
  for (let i = 0; i < numLabels.length; i++) {
    const label = numLabels[i] ?? "", phone = numPhones[i] ?? "";
    if (!label && !phone) continue;
    if (!label || !phone) return { error: "Each important number needs both a name and a phone number." };
    if (label.length > 80) return { error: "Please keep the names of important numbers short." };
    if (!PHONE.test(phone)) return { error: `“${phone}” doesn't look like a phone number. Use digits, spaces and +.` };
    emergency_contacts.push({ label, phone });
  }

  const nTitles = all(form, "pn_title"), nBodies = all(form, "pn_body"), nDates = all(form, "pn_date");
  const public_notices: { title: string; body: string; date: string }[] = [];
  for (let i = 0; i < nTitles.length; i++) {
    const title = nTitles[i] ?? "", body = nBodies[i] ?? "", d = nDates[i] ?? "";
    if (!title && !body) continue;
    if (!title || !body) return { error: "Each notice needs a title and a short message." };
    if (title.length > 100 || body.length > 600) return { error: "Please keep notices short: a title under 100 characters and a message under 600." };
    if (!isDate(d)) return { error: `Please give the notice “${title}” a date.` };
    if (public_notices.some((n) => n.title.toLowerCase() === title.toLowerCase())) return { error: `There are two notices called “${title}”. Please merge them or change one title.` };
    public_notices.push({ title, body, date: d });
  }
  if (office_hours.length > 12 || emergency_contacts.length > 15 || public_notices.length > 10) {
    return { error: "That's a lot of rows. Please keep the landing page short." };
  }
  public_notices.sort((a, b) => b.date.localeCompare(a.date));

  const { error } = await supabase.from("community_public_info").upsert({
    community_id: c.id, tagline, welcome, address: address || null, lat, lng,
    office_hours, emergency_contacts, public_notices, updated_at: new Date().toISOString(),
  }, { onConflict: "community_id" });
  if (error) return { error: "The landing page could not be saved. Please try again." };
  done(c.slug, "landing");
}

// ---------------------------------------------------------------------------
// Branding (community_branding)
// ---------------------------------------------------------------------------
export async function saveBranding(slug: string, _prev: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const primary = text(form, "primary_color").toLowerCase();
  const accent = text(form, "accent_color").toLowerCase();
  if (!HEX.test(primary) || !HEX.test(accent)) return { error: "Please choose colours as six-digit codes, for example #0f766e." };
  if (!isAccessibleBrand(primary)) {
    return { error: `The main colour ${primary} is too hard to read text on. Try ${suggestAccessible(primary)} instead.` };
  }
  if (!isAccessibleBrand(accent)) {
    return { error: `The accent colour ${accent} is too hard to read text on. Try ${suggestAccessible(accent)} instead.` };
  }
  const logo = text(form, "logo_url");
  const hero = text(form, "hero_image_url");
  for (const [label, u] of [["logo", logo], ["hero photo", hero]] as const) {
    if (u && (u.length > 500 || !URL_OK.test(u))) return { error: `The ${label} address must start with https:// (or / for a file on this site).` };
  }

  const { error } = await supabase.from("community_branding").upsert({
    community_id: s.community.id, primary_color: primary, accent_color: accent,
    logo_url: logo || null, hero_image_url: hero || null, updated_at: new Date().toISOString(),
  }, { onConflict: "community_id" });
  if (error) return { error: "The branding could not be saved. Please try again." };
  done(s.community.slug, "branding");
}

// ---------------------------------------------------------------------------
// Settings (communities: name, languages, settings jsonb)
// ---------------------------------------------------------------------------
export async function saveSettings(slug: string, _prev: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();

  const name = text(form, "name").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { error: "Please enter the community's name." };

  const known = LANGUAGES.map((l) => l.code);
  const chosen = known.filter((code) => form.getAll("languages").map(String).includes(code));
  // Keep the existing order and add new languages at the end.
  const languages = [...s.community.enabled_languages.filter((l) => chosen.includes(l)), ...chosen.filter((l) => !s.community.enabled_languages.includes(l))];
  const defaultLanguage = text(form, "default_language");
  if (!languages.length) return { error: "Please offer at least one language." };
  if (!known.includes(defaultLanguage)) return { error: "Please choose the main language." };
  if (!languages.includes(defaultLanguage)) return { error: "The main language must be one of the languages offered." };

  const threshold = parseEurosToCents(text(form, "invoice_threshold"));
  if (threshold == null || threshold < 0 || threshold > 100_000_000) {
    return { error: "Please enter the invoice approval limit in euros, for example 1000." };
  }

  // Merge, so settings other parts of the app keep are not lost.
  const { data: current } = await supabase.from("communities").select("settings").eq("id", s.community.id).single();
  const prev = (current?.settings ?? {}) as Record<string, unknown>;
  const settings = {
    ...prev,
    tenant_requires_approval: form.get("tenant_requires_approval") === "on",
    invoice_approval_threshold_cents: threshold,
    features: {
      ...((prev.features as Record<string, boolean> | undefined) ?? {}),
      ai: form.get("feature_ai") === "on",
      whatsapp: form.get("feature_whatsapp") === "on",
      meetings: form.get("feature_meetings") === "on",
    },
  };

  const { error } = await supabase.from("communities")
    .update({ name, default_language: defaultLanguage, enabled_languages: languages, settings })
    .eq("id", s.community.id);
  if (error) return { error: "The settings could not be saved. Please try again." };
  done(s.community.slug, "settings");
}
