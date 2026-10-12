"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export type ContactField =
  | "role_title" | "contact_group" | "building_id" | "profile_id" | "name" | "organisation"
  | "phone" | "whatsapp" | "email" | "hours" | "notes" | "visibility" | "sort";

export type ContactFormState = { error?: string; fields?: Partial<Record<ContactField, string>> } | undefined;
export type DeleteState = { error?: string } | undefined;

const GROUPS = ["committee", "management", "staff", "services", "emergency"];
const VISIBILITIES = ["all", "owners", "admins"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s().\-/]+$/;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function validPhone(v: string) {
  const digits = v.replace(/\D/g, "").length;
  return v.length <= 30 && PHONE.test(v) && digits >= 3 && digits <= 15;
}

/** Create (id = null) or update a key contact. Admins only; the community always comes from the session. */
export async function saveContact(slug: string, id: string | null, _prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const c = s.community.id;
  if (id !== null && !UUID.test(id)) return { error: "This contact no longer exists. It may have been deleted." };

  const role_title = text(form, "role_title").replace(/\s+/g, " ");
  const contact_group = text(form, "contact_group");
  const building_id = text(form, "building_id") || null;
  const profile_id = text(form, "profile_id") || null;
  const name = text(form, "name") || null;
  const organisation = text(form, "organisation") || null;
  const phone = text(form, "phone") || null;
  const whatsapp = text(form, "whatsapp") || null;
  const email = text(form, "email").toLowerCase() || null;
  const hours = text(form, "hours") || null;
  const notes = text(form, "notes").replace(/\s+/g, " ") || null;
  const visibility = text(form, "visibility") || "all";
  const sortText = text(form, "sort");
  const sort = sortText === "" ? 0 : Number(sortText);

  const f: Partial<Record<ContactField, string>> = {};
  if (role_title.length < 2 || role_title.length > 80) f.role_title = "Use 2 to 80 characters, for example Concierge or President.";
  if (!GROUPS.includes(contact_group)) f.contact_group = "Choose a group.";
  if (!name && !organisation) f.name = "Add a name or an organisation.";
  if (name && name.length > 120) f.name = "Keep the name under 120 characters.";
  if (organisation && organisation.length > 120) f.organisation = "Keep the organisation under 120 characters.";
  if (phone && !validPhone(phone)) f.phone = "Use digits and spaces, with + for the country code, e.g. +34 600 100 200.";
  if (whatsapp && !validPhone(whatsapp)) f.whatsapp = "Use digits and spaces, with + for the country code, e.g. +34 600 100 200.";
  if (email && (email.length > 254 || !EMAIL.test(email))) f.email = "Check the email address, e.g. name@example.com.";
  if (!phone && !whatsapp && !email) f.phone = "Add at least one way to reach them: phone, WhatsApp or email.";
  if (hours && hours.length > 80) f.hours = "Keep the hours under 80 characters.";
  if (notes && notes.length > 300) f.notes = "Keep the note under 300 characters.";
  if (!VISIBILITIES.includes(visibility)) f.visibility = "Choose who can see this contact.";
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) f.sort = "Use a whole number from 0 to 9999.";

  // The block and the linked member must belong to this community.
  const [block, member] = await Promise.all([
    building_id && UUID.test(building_id)
      ? supabase.from("buildings").select("id").eq("id", building_id).eq("community_id", c).maybeSingle()
      : Promise.resolve({ data: null }),
    profile_id && UUID.test(profile_id)
      ? supabase.from("memberships").select("profile_id").eq("profile_id", profile_id).eq("community_id", c).eq("status", "active").limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (building_id && !block.data) f.building_id = "Choose one of this community’s blocks.";
  if (profile_id && !member.data) f.profile_id = "Choose a current member of this community.";

  if (Object.keys(f).length) return { error: "Please check the highlighted fields.", fields: f };

  const row = {
    role_title, contact_group, building_id, profile_id, name, organisation, phone, whatsapp, email, hours, notes, visibility, sort,
  };

  if (id) {
    const { data, error } = await supabase.from("key_contacts").update(row).eq("id", id).eq("community_id", c).select("id");
    if (error) return { error: "The contact could not be saved. Please try again." };
    if (!data?.length) return { error: "This contact no longer exists. It may have been deleted." };
  } else {
    const { error } = await supabase.from("key_contacts").insert({ ...row, community_id: c });
    if (error) return { error: "The contact could not be saved. Please try again." };
  }

  // Contacts also appear on the home page and in the sidebar's help box.
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/contacts?saved=1`);
}

export async function deleteContact(slug: string, id: string): Promise<DeleteState> {
  const s = await requireAdmin(slug);
  if (!UUID.test(id)) return { error: "This contact no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("key_contacts").delete().eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The contact could not be deleted. Please try again." };
  if (!data?.length) return { error: "This contact no longer exists. It may already have been deleted." };
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/contacts?deleted=1`);
}
