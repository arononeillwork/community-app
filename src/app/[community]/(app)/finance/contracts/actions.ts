"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/community";
import { parseEurosToCents } from "@/lib/format";
import { failWith, optional, text, UUID, type FormState } from "@/components/finance/register/form";
import { isFrequency, isIsoDate } from "@/components/finance/register/dates";
import { pickFile, uploadFinanceFile } from "@/components/finance/register/upload";

type Client = Awaited<ReturnType<typeof createClient>>;

const STATUSES = ["active", "ended", "cancelled"];

/** Check and convert the contract form. Returns the row to save or a plain-language error. */
async function readContract(supabase: Client, communityId: string, form: FormData) {
  const supplierId = text(form, "supplier_id");
  if (!UUID.test(supplierId)) return { error: "Please choose the supplier (the company you have the contract with)." };
  const { data: supplier } = await supabase.from("suppliers").select("id").eq("id", supplierId).eq("community_id", communityId).maybeSingle();
  if (!supplier) return { error: "Please choose the supplier from the list." };

  const categoryId = text(form, "category_id");
  if (categoryId) {
    if (!UUID.test(categoryId)) return { error: "Please choose a category from the list." };
    const { data: cat } = await supabase.from("expense_categories").select("id").eq("id", categoryId).eq("community_id", communityId).maybeSingle();
    if (!cat) return { error: "Please choose a category from the list." };
  }

  const title = text(form, "title");
  if (title.length < 3) return { error: "Please give the contract a short name, for example “Garden maintenance”." };
  if (title.length > 200) return { error: "The contract name is too long. Please keep it under 200 characters." };

  const start = text(form, "start_date");
  if (!isIsoDate(start)) return { error: "Please enter the date the contract starts." };
  const end = text(form, "end_date");
  if (end && !isIsoDate(end)) return { error: "The end date is not a valid date. Leave it empty if the contract has no end date." };
  if (end && end < start) return { error: "The end date is before the start date. Please check both dates." };

  const noticeRaw = text(form, "notice_period_days");
  const notice = Number(noticeRaw);
  if (noticeRaw === "" || !Number.isInteger(notice) || notice < 0 || notice > 3650) {
    return { error: "Please enter the notice period as a whole number of days (0 if there is none)." };
  }

  const freq = text(form, "billing_frequency");
  if (!isFrequency(freq)) return { error: "Please choose how often the contract is billed." };

  const amount = parseEurosToCents(text(form, "amount"));
  if (amount == null || amount < 0) return { error: "Please enter the amount per billing period in euros, for example 850 or 850,50." };

  const vatRaw = text(form, "vat_rate").replace(",", ".").replace("%", "").trim();
  const vat = Number(vatRaw);
  if (vatRaw === "" || !Number.isFinite(vat) || vat < 0 || vat > 100) {
    return { error: "Please enter the VAT rate as a percentage between 0 and 100 (usually 21)." };
  }

  const status = text(form, "status");
  if (!STATUSES.includes(status)) return { error: "Please choose the contract status." };

  return {
    row: {
      supplier_id: supplierId,
      category_id: categoryId || null,
      title,
      start_date: start,
      end_date: end || null,
      notice_period_days: notice,
      auto_renew: form.get("auto_renew") === "on",
      billing_frequency: freq,
      amount_cents: amount,
      vat_rate: Math.round(vat * 100) / 100,
      price_review_clause: optional(form, "price_review_clause", 4000),
      status,
      notes: optional(form, "notes", 4000),
    },
  };
}

export async function createContract(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const parsed = await readContract(supabase, s.community.id, form);
  if (parsed.error !== undefined) return failWith(parsed.error, form);

  let filePath: string | null = null;
  const file = pickFile(form);
  if (file) {
    const up = await uploadFinanceFile(supabase, s.community.id, "contracts", file);
    if ("error" in up) return failWith(up.error, form);
    filePath = up.path;
  }

  const { data, error } = await supabase
    .from("contracts")
    .insert({ ...parsed.row, community_id: s.community.id, file_path: filePath })
    .select("id")
    .single();
  if (error || !data) return failWith("The contract could not be saved. Please check the details and try again.", form);

  revalidatePath(`/${slug}/finance/contracts`);
  revalidatePath(`/${slug}/finance/suppliers/${parsed.row.supplier_id}`);
  revalidatePath(`/${slug}/finance`);
  redirect(`/${slug}/finance/contracts/${data.id}?saved=1`);
}

export async function updateContract(slug: string, id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  if (!UUID.test(id)) return failWith("This contract could not be found.", form);
  const { data: existing } = await supabase.from("contracts").select("id, supplier_id").eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!existing) return failWith("This contract could not be found. It may have been deleted.", form);

  const parsed = await readContract(supabase, s.community.id, form);
  if (parsed.error !== undefined) return failWith(parsed.error, form);

  const patch: Record<string, unknown> = { ...parsed.row };
  const file = pickFile(form);
  if (file) {
    const up = await uploadFinanceFile(supabase, s.community.id, "contracts", file);
    if ("error" in up) return failWith(up.error, form);
    patch.file_path = up.path;
  }

  const { error } = await supabase.from("contracts").update(patch).eq("id", id).eq("community_id", s.community.id);
  if (error) return failWith("The changes could not be saved. Please check the details and try again.", form);

  revalidatePath(`/${slug}/finance/contracts`);
  revalidatePath(`/${slug}/finance/contracts/${id}`);
  revalidatePath(`/${slug}/finance/suppliers/${existing.supplier_id}`);
  if (existing.supplier_id !== parsed.row.supplier_id) revalidatePath(`/${slug}/finance/suppliers/${parsed.row.supplier_id}`);
  revalidatePath(`/${slug}/finance`);
  redirect(`/${slug}/finance/contracts/${id}?saved=1`);
}
