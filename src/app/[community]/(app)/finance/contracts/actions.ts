"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents, todayInput } from "@/lib/format";
import { FREQUENCIES, isDate } from "@/components/finance-ops/dates";
import { uploadFinanceFile } from "@/components/finance-ops/storage";

export type ContractFormState = { error?: string; values?: Record<string, string> } | undefined;

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);

/** Create (id = null) or update a contract. */
export async function saveContract(slug: string, id: string | null, _prev: ContractFormState, form: FormData): Promise<ContractFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;

  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  const fail = (error: string): ContractFormState => ({ error, values });

  // Supplier: an existing one of this community, or a new one by name.
  let supplierId = text(form, "supplier_id", 64);
  const newName = text(form, "new_supplier_name", 120);
  const newService = text(form, "new_supplier_service", 80);
  if (supplierId === "new") {
    if (newName.length < 2) return fail("Please enter the new supplier's name.");
    if (newService.length < 2) return fail("Please say what the new supplier does, e.g. Gardening.");
  } else if (!supplierId) {
    return fail("Please choose the supplier.");
  } else {
    const { data } = await supabase.from("suppliers").select("id").eq("community_id", c).eq("id", supplierId).maybeSingle();
    if (!data) return fail("That supplier was not found. Please choose another one.");
  }

  const title = text(form, "title", 120);
  if (title.length < 3) return fail("Please describe the service, e.g. Garden maintenance.");

  const categoryId = text(form, "category_id", 64) || null;
  if (categoryId) {
    const { data } = await supabase.from("expense_categories").select("id").eq("community_id", c).eq("id", categoryId).maybeSingle();
    if (!data) return fail("That budget category was not found.");
  }

  const start = text(form, "start_date", 10);
  const end = text(form, "end_date", 10);
  if (!isDate(start)) return fail("Please enter the start date.");
  if (end && !isDate(end)) return fail("The end date is not a valid date.");
  if (end && end <= start) return fail("The end date must be after the start date.");

  const noticeRaw = text(form, "notice_period_days", 6);
  const notice = noticeRaw === "" ? 0 : Number(noticeRaw);
  if (!Number.isInteger(notice) || notice < 0 || notice > 1095) return fail("The notice period must be a whole number of days (0 to 1095).");

  const frequency = text(form, "billing_frequency", 20);
  if (!FREQUENCIES.some((f) => f.value === frequency)) return fail("Please choose how often the supplier bills.");

  const amount = parseEurosToCents(form.get("amount"));
  if (amount == null || amount <= 0) return fail("Please enter the price per billing period as a positive amount, e.g. 850.00.");
  if (amount > 100_000_000_00) return fail("That amount looks too large. Please check it.");

  const vatRaw = text(form, "vat_rate", 8).replace(",", ".");
  const vat = vatRaw === "" ? 21 : Number(vatRaw);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) return fail("VAT must be a percentage between 0 and 100.");

  const upload = await uploadFinanceFile(c, "contracts", form.get("file"));
  if (upload.error) return fail(upload.error);

  if (supplierId === "new") {
    const { data, error } = await supabase.from("suppliers")
      .insert({ community_id: c, name: newName, service_type: newService }).select("id").single();
    if (error || !data) return fail("The new supplier could not be saved. Please try again.");
    supplierId = data.id;
    // A contract made from a quote with a free-text supplier: link that quote to the new supplier.
    const quoteId = text(form, "quote_id", 64);
    if (quoteId) {
      await supabase.from("quotes").update({ supplier_id: supplierId })
        .eq("community_id", c).eq("id", quoteId).is("supplier_id", null);
    }
  }

  const record: Record<string, unknown> = {
    supplier_id: supplierId,
    category_id: categoryId,
    title,
    start_date: start,
    end_date: end || null,
    notice_period_days: notice,
    auto_renew: form.get("auto_renew") === "on",
    billing_frequency: frequency,
    amount_cents: amount,
    vat_rate: vat,
    price_review_clause: text(form, "price_review_clause", 500) || null,
    notes: text(form, "notes", 2000) || null,
  };
  if (upload.path) record.file_path = upload.path;
  else if (id && form.get("remove_file") === "on") record.file_path = null;

  let savedId = id;
  if (id) {
    const { data, error } = await supabase.from("contracts").update(record).eq("community_id", c).eq("id", id).select("id").maybeSingle();
    if (error || !data) return fail("The contract could not be saved. Please try again.");
  } else {
    const { data, error } = await supabase.from("contracts").insert({ ...record, community_id: c, status: "active" }).select("id").single();
    if (error || !data) return fail("The contract could not be saved. Please try again.");
    savedId = data.id;
  }

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/contracts/${savedId}?saved=${id ? "updated" : "new"}`);
}

/** Mark a contract as ended on a given last day of service. */
export async function endContract(slug: string, id: string, form: FormData) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: contract } = await supabase.from("contracts").select("id, start_date, status")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!contract || contract.status !== "active") redirect(`/${slug}/finance/contracts/${id}`);

  let last = String(form.get("end_date") ?? "").trim();
  if (!isDate(last)) last = todayInput(s.community.timezone);
  if (last < contract.start_date) last = contract.start_date;

  const { error } = await supabase.from("contracts").update({ status: "ended", end_date: last })
    .eq("community_id", s.community.id).eq("id", id);
  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/contracts/${id}?${error ? "error=end" : "saved=ended"}`);
}
