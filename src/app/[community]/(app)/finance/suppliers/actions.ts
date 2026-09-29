"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/community";
import { failWith, optional, text, UUID, type ActionState, type FormState } from "@/components/finance/register/form";

/** Check and tidy the supplier form. */
function readSupplier(form: FormData) {
  const name = text(form, "name");
  if (name.length < 2) return { error: "Please enter the company name." };
  if (name.length > 200) return { error: "The company name is too long. Please keep it under 200 characters." };

  const serviceType = text(form, "service_type");
  if (serviceType.length < 2) return { error: "Please say what the company does for the community, for example “Gardening”." };

  const email = optional(form, "email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "The email address does not look right. Please check it." };

  let website = optional(form, "website", 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website) {
    try {
      new URL(website);
    } catch {
      return { error: "The website address does not look right. Please check it, for example www.example.com." };
    }
  }

  let iban = optional(form, "iban", 60);
  if (iban) {
    const compact = iban.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) {
      return { error: "The bank account (IBAN) does not look right. It starts with two letters, like ES91 2100 0418 …" };
    }
    iban = compact.replace(/(.{4})/g, "$1 ").trim();
  }

  return {
    row: {
      name,
      service_type: serviceType.slice(0, 120),
      contact_name: optional(form, "contact_name", 200),
      email,
      phone: optional(form, "phone", 60),
      website,
      address: optional(form, "address", 500),
      tax_id: optional(form, "tax_id", 40)?.toUpperCase() ?? null,
      iban,
      notes: optional(form, "notes", 4000),
    },
  };
}

export async function createSupplier(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const parsed = readSupplier(form);
  if (parsed.error !== undefined) return failWith(parsed.error, form);

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...parsed.row, community_id: s.community.id, active: true })
    .select("id")
    .single();
  if (error || !data) return failWith("The supplier could not be saved. Please check the details and try again.", form);

  revalidatePath(`/${slug}/finance/suppliers`);
  redirect(`/${slug}/finance/suppliers/${data.id}?saved=1`);
}

export async function updateSupplier(slug: string, id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  if (!UUID.test(id)) return failWith("This supplier could not be found.", form);
  const parsed = readSupplier(form);
  if (parsed.error !== undefined) return failWith(parsed.error, form);

  const { data, error } = await supabase
    .from("suppliers")
    .update(parsed.row)
    .eq("id", id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error) return failWith("The changes could not be saved. Please check the details and try again.", form);
  if (!data || data.length === 0) return failWith("This supplier could not be found. It may have been deleted.", form);

  revalidatePath(`/${slug}/finance/suppliers`);
  revalidatePath(`/${slug}/finance/suppliers/${id}`);
  revalidatePath(`/${slug}/finance/contracts`);
  redirect(`/${slug}/finance/suppliers/${id}?saved=1`);
}

/** Mark a supplier active or inactive (kept in the records either way). */
export async function setSupplierActive(slug: string, id: string, active: boolean): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  if (!UUID.test(id)) return { error: "This supplier could not be found." };

  const { data, error } = await supabase
    .from("suppliers")
    .update({ active })
    .eq("id", id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error || !data || data.length === 0) return { error: "The change could not be saved. Please try again." };

  revalidatePath(`/${slug}/finance/suppliers`);
  revalidatePath(`/${slug}/finance/suppliers/${id}`);
  return { ok: active ? "The supplier is active again." : "The supplier is now marked as inactive." };
}
