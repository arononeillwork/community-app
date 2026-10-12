"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, type Session } from "@/lib/community";
import { formatIban, normaliseIban, validIban } from "@/components/finance/iban";

export type SupplierFormState = { error?: string; fields?: Record<string, string>; existingId?: string } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s().-]{6,24}$/;
const TAX_ID = /^[A-Z0-9-]{5,20}$/;

function text(form: FormData, key: string, max: number) {
  return String(form.get(key) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

async function parseSupplier(s: Session, form: FormData, current?: { id: string; iban: string | null }) {
  const supabase = await createClient();
  const fields: Record<string, string> = {};
  const name = text(form, "name", 120);
  const service_type = text(form, "service_type", 80);
  const tax_id = text(form, "tax_id", 20).toUpperCase().replace(/\s/g, "");
  const contact_name = text(form, "contact_name", 120);
  const email = text(form, "email", 160).toLowerCase();
  const phone = text(form, "phone", 30);
  // Editing keeps the stored IBAN unless the person chose to change or remove it (it is never sent to the form).
  const ibanAction = current ? String(form.get("iban_action") ?? "keep") : "change";
  const iban = ibanAction === "keep" ? normaliseIban(current?.iban ?? "")
    : ibanAction === "remove" ? "" : normaliseIban(String(form.get("iban") ?? ""));
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);

  if (name.length < 2) fields.name = "Enter the company name.";
  if (service_type.length < 2) fields.service_type = "Say what they do, for example Gardening or Lift maintenance.";
  if (tax_id && !TAX_ID.test(tax_id)) fields.tax_id = "A tax ID (CIF/NIF) has letters and numbers only, e.g. B29000001.";
  if (email && !EMAIL.test(email)) fields.email = "Enter a valid email address, or leave it empty.";
  if (phone && !PHONE.test(phone)) fields.phone = "Enter a phone number with digits, e.g. +34 952 100 001.";
  // The checksum is only checked when the IBAN is new or changed, so older records can still be edited.
  const ibanChanged = iban !== normaliseIban(current?.iban ?? "");
  if (ibanAction === "change" && current && !iban) fields.iban = "Enter the new IBAN, or keep the current one.";
  else if (iban && ibanChanged && !validIban(iban)) fields.iban = "This IBAN does not look right. Check each character against the supplier's bank details.";

  if (!fields.name) {
    const { data: same } = await supabase.from("suppliers").select("id, name")
      .eq("community_id", s.community.id).ilike("name", name.replace(/[%_\\]/g, (m) => `\\${m}`));
    const other = (same ?? []).find((x) => x.id !== current?.id);
    if (other) return { fields: { name: "A supplier with this name already exists." }, existingId: other.id as string };
  }

  return {
    fields,
    values: {
      name, service_type, tax_id: tax_id || null, contact_name: contact_name || null, email: email || null,
      phone: phone || null, iban: iban ? formatIban(iban) : null, notes: notes || null,
    },
  };
}

export async function createSupplier(slug: string, _prev: SupplierFormState, form: FormData): Promise<SupplierFormState> {
  const s = await requireFinance(slug);
  const parsed = await parseSupplier(s, form);
  if ("existingId" in parsed) return { error: "This supplier is already in the list.", fields: parsed.fields, existingId: parsed.existingId };
  if (Object.keys(parsed.fields).length) return { error: "Please check the highlighted fields.", fields: parsed.fields };

  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from("suppliers").insert({ id, community_id: s.community.id, ...parsed.values });
  if (error) return { error: "The supplier could not be saved. Please try again." };

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/suppliers/${id}?saved=added`);
}

export async function updateSupplier(slug: string, id: string, _prev: SupplierFormState, form: FormData): Promise<SupplierFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: current } = await supabase.from("suppliers").select("id, iban")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!current) return { error: "This supplier no longer exists." };

  const parsed = await parseSupplier(s, form, current);
  if ("existingId" in parsed) return { error: "Another supplier already has this name.", fields: parsed.fields, existingId: parsed.existingId };
  if (Object.keys(parsed.fields).length) return { error: "Please check the highlighted fields.", fields: parsed.fields };

  const active = form.get("active") === "1";
  const { error } = await supabase.from("suppliers").update({ ...parsed.values, active })
    .eq("community_id", s.community.id).eq("id", id);
  if (error) return { error: "The changes could not be saved. Please try again." };

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/suppliers/${id}?saved=updated`);
}

/** The full IBAN, only on request and only for finance roles (it is masked on the page). */
export async function revealIban(slug: string, id: string): Promise<{ iban?: string; error?: string }> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("iban").eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!data?.iban) return { error: "No IBAN on record." };
  return { iban: formatIban(normaliseIban(data.iban)) };
}
