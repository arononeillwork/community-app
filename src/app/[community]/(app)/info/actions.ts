"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { INFO_CATEGORY_KEYS, INFO_ICON_KEYS, UUID_RE, VISIBILITIES } from "@/components/library/meta";

export type DeleteResult = { error?: string } | void;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const oneLine = (v: string) => v.replace(/\s+/g, " ");

function parseOrder(v: string) {
  const n = v === "" ? 0 : Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}

// ---------------------------------------------------------------------------- building information
export type InfoField = "title" | "category" | "icon" | "body" | "visibility" | "sort";
export type InfoFormState = { error?: string; fields?: Partial<Record<InfoField, string>> } | undefined;

/** Create (id = null) or update an information page. Admins only; the community always comes from the session. */
export async function saveInfoPage(slug: string, id: string | null, _prev: InfoFormState, form: FormData): Promise<InfoFormState> {
  const s = await requireAdmin(slug);
  if (id !== null && !UUID_RE.test(id)) return { error: "This page no longer exists. It may have been deleted." };
  const supabase = await createClient();

  const title = oneLine(text(form, "title"));
  const category = text(form, "category");
  const icon = text(form, "icon");
  const body = text(form, "body").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const visibility = text(form, "visibility") || "all";
  const sort = parseOrder(text(form, "sort"));

  const f: Partial<Record<InfoField, string>> = {};
  if (title.length < 2 || title.length > 80) f.title = "Use 2 to 80 characters, for example Swimming pool.";
  if (!INFO_CATEGORY_KEYS.includes(category)) f.category = "Choose a section.";
  if (!INFO_ICON_KEYS.includes(icon)) f.icon = "Choose an icon.";
  if (body.length < 3) f.body = "Write what residents need to know.";
  else if (body.length > 5000) f.body = "Keep it under 5,000 characters. Long documents belong in Documents.";
  if (!(VISIBILITIES as string[]).includes(visibility)) f.visibility = "Choose who can see this.";
  if (sort === null) f.sort = "Use a whole number from 0 to 999.";
  if (Object.keys(f).length) return { error: "Please check the highlighted fields.", fields: f };

  const row = { title, category, icon, body, visibility, sort: sort!, updated_at: new Date().toISOString() };
  if (id) {
    const { data, error } = await supabase.from("info_pages").update(row).eq("id", id).eq("community_id", s.community.id).select("id");
    if (error) return { error: "The page could not be saved. Please try again." };
    if (!data?.length) return { error: "This page no longer exists. It may have been deleted." };
  } else {
    const { error } = await supabase.from("info_pages").insert({ ...row, community_id: s.community.id });
    if (error) return { error: "The page could not be saved. Please try again." };
  }

  revalidatePath(`/${slug}/info`);
  redirect(`/${slug}/info?saved=info`);
}

export async function deleteInfoPage(slug: string, id: string): Promise<DeleteResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This page no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("info_pages").delete().eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The page could not be deleted. Please try again." };
  if (!data?.length) return { error: "This page no longer exists. It may already have been deleted." };
  revalidatePath(`/${slug}/info`);
  redirect(`/${slug}/info?deleted=info`);
}

// ---------------------------------------------------------------------------- bins
export type BinField = "bin_type" | "color" | "color_hex" | "weekdays" | "put_out_time" | "location" | "notes" | "sort";
export type BinFormState = { error?: string; fields?: Partial<Record<BinField, string>> } | undefined;

/** Create (id = null) or update a bin type and its collection days. Admins only. */
export async function saveBin(slug: string, id: string | null, _prev: BinFormState, form: FormData): Promise<BinFormState> {
  const s = await requireAdmin(slug);
  if (id !== null && !UUID_RE.test(id)) return { error: "This bin no longer exists. It may have been deleted." };
  const supabase = await createClient();

  const bin_type = oneLine(text(form, "bin_type"));
  const color = oneLine(text(form, "color")).toLowerCase();
  const color_hex = text(form, "color_hex").toLowerCase();
  const rawDays = form.getAll("weekdays").map((v) => Number(v));
  const weekdays = [...new Set(rawDays)].sort((a, b) => a - b);
  const put_out_time = oneLine(text(form, "put_out_time")) || null;
  const location = oneLine(text(form, "location")) || null;
  const notes = oneLine(text(form, "notes")) || null;
  const sort = parseOrder(text(form, "sort"));

  const f: Partial<Record<BinField, string>> = {};
  if (bin_type.length < 2 || bin_type.length > 60) f.bin_type = "Use 2 to 60 characters, for example Paper and cardboard.";
  if (color.length < 2 || color.length > 30) f.color = "Say the colour residents see, for example blue.";
  if (!/^#[0-9a-f]{6}$/.test(color_hex)) f.color_hex = "Pick a colour, or type it as #2563eb.";
  if (weekdays.length === 0) f.weekdays = "Tick at least one collection day.";
  else if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) f.weekdays = "Tick the collection days again.";
  if (put_out_time && put_out_time.length > 60) f.put_out_time = "Keep it under 60 characters, for example After 20:00.";
  if (location && location.length > 100) f.location = "Keep it under 100 characters.";
  if (notes && notes.length > 300) f.notes = "Keep the note under 300 characters.";
  if (sort === null) f.sort = "Use a whole number from 0 to 999.";
  if (Object.keys(f).length) return { error: "Please check the highlighted fields.", fields: f };

  const row = { bin_type, color, color_hex, weekdays, put_out_time, location, notes, sort: sort! };
  if (id) {
    const { data, error } = await supabase.from("bin_schedules").update(row).eq("id", id).eq("community_id", s.community.id).select("id");
    if (error) return { error: "The bin could not be saved. Please try again." };
    if (!data?.length) return { error: "This bin no longer exists. It may have been deleted." };
  } else {
    const { error } = await supabase.from("bin_schedules").insert({ ...row, community_id: s.community.id });
    if (error) return { error: "The bin could not be saved. Please try again." };
  }

  // Bin days also show on the home page.
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/info?saved=bin`);
}

export async function deleteBin(slug: string, id: string): Promise<DeleteResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This bin no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("bin_schedules").delete().eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The bin could not be deleted. Please try again." };
  if (!data?.length) return { error: "This bin no longer exists. It may already have been deleted." };
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/info?deleted=bin`);
}
