"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents } from "@/lib/format";
import { isDate, jobAnchor } from "@/components/finance-ops/dates";
import { uploadFinanceFile } from "@/components/finance-ops/storage";

export type QuoteFormState = { error?: string; values?: Record<string, string> } | undefined;

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);

/** Add a quote to a job (new or existing). The supplier is one from the register or a free-text name. */
export async function addQuote(slug: string, _prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  const fail = (error: string): QuoteFormState => ({ error, values });

  const job = text(form, "job_title", 120).replace(/\s+/g, " ");
  if (job.length < 3) return fail("Please name the job, e.g. Roof waterproofing Block C.");

  let supplierId: string | null = text(form, "supplier_id", 64) || null;
  let supplierName = text(form, "supplier_name", 120);
  if (supplierId && supplierId !== "other") {
    const { data } = await supabase.from("suppliers").select("id, name").eq("community_id", c).eq("id", supplierId).maybeSingle();
    if (!data) return fail("That supplier was not found. Please choose another one.");
    supplierName = data.name;
  } else {
    supplierId = null;
    if (supplierName.length < 2) return fail("Please choose a supplier or type the company's name.");
  }

  const amount = parseEurosToCents(form.get("amount"));
  if (amount == null || amount <= 0) return fail("Please enter the quoted price, e.g. 3920.40.");
  if (amount > 100_000_000_00) return fail("That amount looks too large. Please check it.");

  const validUntil = text(form, "valid_until", 10);
  if (validUntil && !isDate(validUntil)) return fail("The 'valid until' date is not a valid date.");

  const upload = await uploadFinanceFile(c, "quotes", form.get("file"));
  if (upload.error) return fail(upload.error);

  // Reuse the exact spelling of an existing job so quotes group together.
  const { data: jobs } = await supabase.from("quotes").select("job_title").eq("community_id", c);
  const existing = (jobs ?? []).find((j) => j.job_title.toLowerCase() === job.toLowerCase())?.job_title;

  const { data, error } = await supabase.from("quotes").insert({
    community_id: c, job_title: existing ?? job, supplier_id: supplierId, supplier_name: supplierName,
    amount_cents: amount, valid_until: validUntil || null, notes: text(form, "notes", 1000) || null,
    file_path: upload.path, chosen: false,
  }).select("id").single();
  if (error || !data) return fail("The quote could not be saved. Please try again.");

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/quotes?added=${data.id}#${jobAnchor(existing ?? job)}`);
}

/** Choose one quote for its job: chosen = true for it, false for the other quotes of the same job. */
export async function chooseQuote(slug: string, quoteId: string) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const { data: q } = await supabase.from("quotes").select("id, job_title").eq("community_id", c).eq("id", quoteId).maybeSingle();
  if (!q) redirect(`/${slug}/finance/quotes`);

  const { error: clearError } = await supabase.from("quotes").update({ chosen: false })
    .eq("community_id", c).eq("job_title", q.job_title).neq("id", q.id).eq("chosen", true);
  const { error } = clearError ? { error: clearError } : await supabase.from("quotes").update({ chosen: true }).eq("community_id", c).eq("id", q.id);

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/quotes?${error ? "error=choose" : `chosen=${q.id}`}#${jobAnchor(q.job_title)}`);
}
