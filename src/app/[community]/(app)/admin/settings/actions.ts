"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents } from "@/lib/format";
import { colourProblem, normaliseHex } from "@/components/admin/colour";
import { ISO_DATE_RE, LANGUAGE_CODES } from "@/components/admin/labels";
import type { AdminState } from "@/components/admin/types";

const SAVE_FAILED = "Your changes could not be saved. Please try again in a moment.";
const MAX_THRESHOLD_CENTS = 100_000_000; // €1,000,000
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function str(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

/** The community's name, colours and public page appear everywhere under /<slug> and on the platform home. */
function refresh(slug: string) {
  revalidatePath(`/${slug}`, "layout");
  revalidatePath("/");
}

/* ---------------------------------------------------------------------------
   General
   --------------------------------------------------------------------------- */

export async function saveGeneral(slug: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const cid = s.community.id;

  const name = str(form.get("name"));
  if (name.length < 2 || name.length > 100) return { error: "Please enter the community's name (2 to 100 characters)." };

  const requiresApproval = form.get("tenant_requires_approval") === "yes";

  const cents = parseEurosToCents(form.get("threshold"));
  if (cents == null || cents < 0 || cents > MAX_THRESHOLD_CENTS) {
    return { error: "Please enter the invoice approval limit in euros, for example 1000 or 1000.00." };
  }

  const picked = new Set(form.getAll("languages").map(String));
  const languages = LANGUAGE_CODES.filter((c) => picked.has(c));
  if (languages.length === 0) return { error: "Please switch on at least one language." };
  const defaultLanguage = str(form.get("default_language"));
  if (!languages.includes(defaultLanguage)) {
    return { error: "The main language must be one of the languages you have switched on." };
  }

  // Merge into the existing settings so other keys (features, …) are kept.
  const { data: row, error: readError } = await supabase.from("communities").select("settings").eq("id", cid).single();
  if (readError || !row) return { error: SAVE_FAILED };
  const settings = {
    ...asObject(row.settings),
    tenant_requires_approval: requiresApproval,
    invoice_approval_threshold_cents: cents,
  };

  const { data: updated, error } = await supabase
    .from("communities")
    .update({ name, settings, enabled_languages: languages, default_language: defaultLanguage })
    .eq("id", cid)
    .select("id");
  if (error || !updated || updated.length === 0) return { error: SAVE_FAILED };

  refresh(slug);
  return { ok: "Saved. The changes are live now." };
}

/* ---------------------------------------------------------------------------
   Branding: colours + logo
   --------------------------------------------------------------------------- */

export async function saveBranding(slug: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const cid = s.community.id;

  const primaryProblem = colourProblem(str(form.get("primary_color")));
  if (primaryProblem) return { error: `Main colour: ${primaryProblem}` };
  const accentProblem = colourProblem(str(form.get("accent_color")));
  if (accentProblem) return { error: `Second colour: ${accentProblem}` };
  const primary = normaliseHex(str(form.get("primary_color")))!;
  const accent = normaliseHex(str(form.get("accent_color")))!;

  let logoUrl: string | null | undefined; // undefined = keep the current logo
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) return { error: "The logo must be a picture file: PNG, JPG, WebP or GIF." };
    if (file.size > MAX_LOGO_BYTES) return { error: "The logo is too large. Please use a picture smaller than 2 MB." };
    // Public "branding" bucket, path <community_id>/logo-<uuid>.<ext> (storage policy: admins of that community only).
    const path = `${cid}/logo-${randomUUID()}.${ext}`;
    const { error: upError } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
    if (upError) return { error: "The logo could not be uploaded. Please try again." };
    logoUrl = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  } else if (form.get("remove_logo") === "yes") {
    logoUrl = null;
  }

  const patch: Record<string, unknown> = {
    community_id: cid,
    primary_color: primary,
    accent_color: accent,
    updated_at: new Date().toISOString(),
  };
  if (logoUrl !== undefined) patch.logo_url = logoUrl;

  const { error } = await supabase.from("community_branding").upsert(patch, { onConflict: "community_id" });
  if (error) return { error: SAVE_FAILED };

  refresh(slug);
  return { ok: logoUrl ? "Saved. Your new colours and logo are live now." : "Saved. Your colours are live now." };
}

/* ---------------------------------------------------------------------------
   Public landing page (community_public_info)
   --------------------------------------------------------------------------- */

type RowSpec = { fields: Record<string, number>; required: string[]; missing: string };

/** Parse the JSON list that the rows editor puts in a hidden input. Empty rows are dropped. */
function parseRows(raw: FormDataEntryValue | null, spec: RowSpec): { rows: Record<string, string>[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(typeof raw === "string" && raw ? raw : "[]");
  } catch {
    return { error: "Something went wrong reading the form. Please reload the page and try again." };
  }
  if (!Array.isArray(data)) return { rows: [] };
  const rows = data.slice(0, 50).map((r) => {
    const o = asObject(r);
    return Object.fromEntries(
      Object.entries(spec.fields).map(([k, max]) => [k, typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : ""]),
    );
  }).filter((r) => Object.values(r).some(Boolean));
  if (rows.some((r) => spec.required.some((k) => !r[k]))) return { error: spec.missing };
  return { rows };
}

function parseCoordinate(raw: FormDataEntryValue | null, min: number, max: number): { value: number | null } | null {
  const s = str(raw).replace(",", ".");
  if (!s) return { value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? { value: n } : null;
}

export async function savePublicInfo(slug: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const cid = s.community.id;

  const { data: current, error: readError } = await supabase
    .from("community_public_info").select("tagline, welcome").eq("community_id", cid).maybeSingle();
  if (readError) return { error: SAVE_FAILED };

  // Texts per language. Languages that are switched off keep their old text (in case they are switched on again).
  const tagline = asObject(current?.tagline);
  const welcome = asObject(current?.welcome);
  const enabled = (s.community.enabled_languages ?? []).filter((l) => LANGUAGE_CODES.includes(l));
  const languages = enabled.length ? enabled : ["en"]; // same list the form shows
  for (const lang of languages) {
    const t = str(form.get(`tagline_${lang}`)).slice(0, 200);
    const w = str(form.get(`welcome_${lang}`)).slice(0, 4000);
    if (t) tagline[lang] = t; else delete tagline[lang];
    if (w) welcome[lang] = w; else delete welcome[lang];
  }

  const address = str(form.get("address")).slice(0, 300) || null;
  const lat = parseCoordinate(form.get("lat"), -90, 90);
  if (!lat) return { error: "Latitude must be a number between -90 and 90, for example 36.4843. Leave it empty if you are not sure." };
  const lng = parseCoordinate(form.get("lng"), -180, 180);
  if (!lng) return { error: "Longitude must be a number between -180 and 180, for example -4.9906. Leave it empty if you are not sure." };
  if ((lat.value == null) !== (lng.value == null)) {
    return { error: "Please fill in both latitude and longitude for the map, or leave both empty." };
  }

  const hours = parseRows(form.get("office_hours"), {
    fields: { label: 80, hours: 120 }, required: ["label", "hours"],
    missing: "Please fill in both the name and the times for every opening-hours row, or remove the row.",
  });
  if ("error" in hours) return { error: hours.error };
  const contacts = parseRows(form.get("emergency_contacts"), {
    fields: { label: 100, phone: 40 }, required: ["label", "phone"],
    missing: "Please fill in both the name and the phone number for every important number, or remove the row.",
  });
  if ("error" in contacts) return { error: contacts.error };
  if (contacts.rows.some((c) => !/^[0-9+()\-.\s]{2,40}$/.test(c.phone))) {
    return { error: "Phone numbers may only contain numbers, spaces and + ( ) - characters." };
  }
  const notices = parseRows(form.get("public_notices"), {
    fields: { title: 120, body: 2000, date: 10 }, required: ["title", "date"],
    missing: "Please give every notice a title and a date, or remove the notice.",
  });
  if ("error" in notices) return { error: notices.error };
  if (notices.rows.some((n) => !ISO_DATE_RE.test(n.date) || Number.isNaN(new Date(`${n.date}T00:00:00Z`).getTime()))) {
    return { error: "Please choose a valid date for every notice." };
  }

  const { error } = await supabase.from("community_public_info").upsert({
    community_id: cid,
    tagline,
    welcome,
    address,
    lat: lat.value,
    lng: lng.value,
    office_hours: hours.rows,
    emergency_contacts: contacts.rows,
    public_notices: notices.rows,
    updated_at: new Date().toISOString(),
  }, { onConflict: "community_id" });
  if (error) return { error: SAVE_FAILED };

  refresh(slug);
  return { ok: "Saved. The public page shows the new information now." };
}
