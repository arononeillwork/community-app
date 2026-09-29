"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/community";
import { parseEurosToCents } from "@/lib/format";
import { failWith, optional, text, UUID, type ActionState, type FormState } from "@/components/finance/register/form";
import { isIsoDate } from "@/components/finance/register/dates";
import { pickFile, uploadFinanceFile } from "@/components/finance/register/upload";

export async function createQuote(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const cid = s.community.id;

  const jobTitle = text(form, "job_title").replace(/\s+/g, " ");
  if (jobTitle.length < 3) return failWith("Please say what the job is, for example “Roof repair Block C”.", form);
  if (jobTitle.length > 200) return failWith("The job name is too long. Please keep it under 200 characters.", form);

  let supplierId: string | null = null;
  let supplierName: string | null = null;
  if (text(form, "supplier_mode") === "list") {
    const id = text(form, "supplier_id");
    if (!UUID.test(id)) return failWith("Please choose the supplier from the list, or choose “A different company” and type the name.", form);
    const { data: sup } = await supabase.from("suppliers").select("id, name").eq("id", id).eq("community_id", cid).maybeSingle();
    if (!sup) return failWith("Please choose the supplier from the list.", form);
    supplierId = sup.id as string;
    supplierName = sup.name as string; // kept as well, in case the supplier is removed later
  } else {
    supplierName = optional(form, "supplier_name", 200);
    if (!supplierName || supplierName.length < 2) return failWith("Please type the name of the company that gave the quote.", form);
  }

  const amount = parseEurosToCents(text(form, "amount"));
  if (amount == null || amount <= 0) return failWith("Please enter the price in euros, for example 3920 or 3.920,40.", form);

  const validUntil = text(form, "valid_until");
  if (validUntil && !isIsoDate(validUntil)) return failWith("The “valid until” date is not a valid date.", form);

  let filePath: string | null = null;
  const file = pickFile(form);
  if (file) {
    const up = await uploadFinanceFile(supabase, cid, "quotes", file);
    if ("error" in up) return failWith(up.error, form);
    filePath = up.path;
  }

  const { error } = await supabase.from("quotes").insert({
    community_id: cid,
    job_title: jobTitle,
    supplier_id: supplierId,
    supplier_name: supplierName,
    amount_cents: amount,
    valid_until: validUntil || null,
    file_path: filePath,
    notes: optional(form, "notes", 4000),
    chosen: false,
  });
  if (error) return failWith("The quote could not be saved. Please check the details and try again.", form);

  revalidatePath(`/${slug}/finance/quotes`);
  redirect(`/${slug}/finance/quotes?added=1`);
}

/** Mark one quote as chosen and every other quote for the same job as not chosen. */
export async function chooseQuote(slug: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireFinance(slug);
  if (form.get("confirm") !== "yes") return { error: "Please confirm your choice first." };
  if (!UUID.test(id)) return { error: "This quote could not be found." };
  const supabase = await createClient();
  const cid = s.community.id;

  const { data: q } = await supabase.from("quotes").select("id, job_title").eq("id", id).eq("community_id", cid).maybeSingle();
  if (!q) return { error: "This quote could not be found. It may have been deleted." };

  // One transaction in the database: marks this quote chosen and the job's other quotes not chosen.
  const { error } = await supabase.rpc("choose_quote", { p_quote: id });
  if (error) return { error: "The choice could not be saved. Please try again." };

  revalidatePath(`/${slug}/finance/quotes`);
  redirect(`/${slug}/finance/quotes?chosen=${id}`);
}

export async function deleteQuote(slug: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireFinance(slug);
  if (form.get("confirm") !== "yes") return { error: "Please confirm that you want to delete the quote." };
  if (!UUID.test(id)) return { error: "This quote could not be found." };
  const supabase = await createClient();

  const { data, error } = await supabase.from("quotes").delete().eq("id", id).eq("community_id", s.community.id).select("id, file_path");
  if (error) return { error: "The quote could not be deleted. Please try again." };
  if (!data || data.length === 0) return { error: "This quote could not be found. It may have been deleted already." };
  // Tidy up the attached file. Best effort: the quote is already gone either way.
  const filePath = data[0].file_path as string | null;
  if (filePath) await supabase.storage.from("finance").remove([filePath]);

  revalidatePath(`/${slug}/finance/quotes`);
  redirect(`/${slug}/finance/quotes?deleted=1`);
}
