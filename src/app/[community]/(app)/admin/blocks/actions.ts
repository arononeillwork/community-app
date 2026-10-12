"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export type BlockFormState = { error?: string } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim().replace(/\s+/g, " ");
}

/** Optional whole number in a range. undefined = invalid, null = empty. */
function intOrNull(v: string, min: number, max: number) {
  if (!v) return null;
  if (!/^-?\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/** Participation share in % ("2,5253" or "2.5253"), 0–100, four decimals. */
function share(v: string) {
  const s = v.replace(/\s|%/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 0 && n <= 100 ? Math.round(n * 10000) / 10000 : undefined;
}

function refresh(slug: string) {
  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}/admin/blocks`, "layout");
}

async function blockInCommunity(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("buildings").select("id, name").eq("id", id).eq("community_id", communityId).maybeSingle();
  return data;
}

/** The name of an existing block with the same name (any case), if there is one. */
async function nameTaken(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, name: string, except?: string) {
  const { data } = await supabase.from("buildings").select("id, name").eq("community_id", communityId);
  return (data ?? []).find((b) => b.id !== except && b.name.toLowerCase() === name.toLowerCase())?.name as string | undefined;
}

export async function addBlock(slug: string, _prev: BlockFormState, form: FormData): Promise<BlockFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const name = text(form, "name");
  if (name.length < 1 || name.length > 60) return { error: "Please give the block a name, for example “Block D”." };
  const taken = await nameTaken(supabase, s.community.id, name);
  if (taken) return { error: `There is already a block called ${taken}.` };

  const { data: last } = await supabase.from("buildings").select("sort").eq("community_id", s.community.id)
    .order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("buildings")
    .insert({ community_id: s.community.id, name, sort: (last?.sort ?? 0) + 1 }).select("id").single();
  if (error || !data) return { error: "The block could not be added. Please try again." };
  refresh(slug);
  redirect(`/${s.community.slug}/admin/blocks/${data.id}?created=1`);
}

export async function renameBlock(slug: string, buildingId: string, _prev: BlockFormState, form: FormData): Promise<BlockFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!(await blockInCommunity(supabase, s.community.id, buildingId))) return { error: "That block could not be found." };
  const name = text(form, "name");
  if (name.length < 1 || name.length > 60) return { error: "Please give the block a name." };
  const taken = await nameTaken(supabase, s.community.id, name, buildingId);
  if (taken) return { error: `There is already a block called ${taken}.` };
  const { error } = await supabase.from("buildings").update({ name }).eq("id", buildingId).eq("community_id", s.community.id);
  if (error) return { error: "The name could not be saved. Please try again." };
  refresh(slug);
  redirect(`/${s.community.slug}/admin/blocks/${buildingId}?saved=name`);
}

function readFlat(form: FormData) {
  const floor = intOrNull(text(form, "floor"), -5, 99);
  if (floor === undefined) return { error: "Please enter the floor as a whole number, for example 2 (0 for the ground floor)." } as const;
  const bedrooms = intOrNull(text(form, "bedrooms"), 0, 20);
  if (bedrooms === undefined) return { error: "Please enter the number of bedrooms, for example 2." } as const;
  const coefficient = share(text(form, "coefficient") || "0");
  if (coefficient === undefined) return { error: "Please enter the share as a percentage between 0 and 100, for example 2.5253." } as const;
  return { value: { floor, bedrooms, coefficient } } as const;
}

export async function addFlat(slug: string, buildingId: string, _prev: BlockFormState, form: FormData): Promise<BlockFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!(await blockInCommunity(supabase, s.community.id, buildingId))) return { error: "That block could not be found." };
  const label = text(form, "label").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 .\-/]{0,19}$/.test(label)) return { error: "Please give the flat a short name of letters and numbers, for example D-1A." };
  const r = readFlat(form);
  if ("error" in r) return { error: r.error };

  const { data: clash } = await supabase.from("units").select("id").eq("community_id", s.community.id).ilike("label", label.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
  if (clash?.length) return { error: `There is already a flat called ${label}.` };

  const { error } = await supabase.from("units").insert({ community_id: s.community.id, building_id: buildingId, label, ...r.value });
  if (error) return { error: "The flat could not be added. Please try again." };
  refresh(slug);
  redirect(`/${s.community.slug}/admin/blocks/${buildingId}?saved=flat&flat=${encodeURIComponent(label)}`);
}

export async function updateFlat(slug: string, unitId: string, _prev: BlockFormState, form: FormData): Promise<BlockFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!UUID.test(unitId)) return { error: "That flat could not be found." };
  const r = readFlat(form);
  if ("error" in r) return { error: r.error };
  const { data, error } = await supabase.from("units").update(r.value)
    .eq("id", unitId).eq("community_id", s.community.id).select("label, building_id").maybeSingle();
  if (error || !data) return { error: "The flat could not be saved. Please try again." };
  refresh(slug);
  redirect(`/${s.community.slug}/admin/blocks?saved=${encodeURIComponent(data.label)}${data.building_id ? `#block-${data.building_id}` : ""}`);
}
