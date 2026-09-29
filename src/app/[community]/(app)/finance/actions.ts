"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/community";
import { date, parseEurosToCents, todayInput } from "@/lib/format";
import {
  VAT_RATES, addDaysInput, approvalThreshold, isIsoDate, requiredApprovals, vatFromNet,
} from "@/components/finance/invoice-utils";

/** State returned to useActionState forms. `tone` says how to show `message`. */
export type InvoiceActionState = {
  error?: string;
  message?: string;
  tone?: "ok" | "info";
  /** When a duplicate invoice exists, its id (so the form can link to it). */
  existingId?: string;
} | undefined;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function field(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function revalidateInvoice(slug: string, id?: string) {
  revalidatePath(`/${slug}/finance`);
  revalidatePath(`/${slug}/finance/invoices`);
  if (id) revalidatePath(`/${slug}/finance/invoices/${id}`);
}

type InvoiceRow = {
  id: string;
  status: "received" | "approved" | "paid" | "disputed";
  total_cents: number;
  issue_date: string;
  notes: string | null;
  invoice_number: string;
};

async function loadInvoice(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, id: string) {
  const { data } = await supabase
    .from("invoices")
    .select("id, status, total_cents, issue_date, notes, invoice_number")
    .eq("id", id)
    .eq("community_id", communityId)
    .maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Add an invoice
// ---------------------------------------------------------------------------
export async function createInvoice(slug: string, _prev: InvoiceActionState, form: FormData): Promise<InvoiceActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const communityId = s.community.id;

  const supplierId = field(form, "supplier_id");
  const contractId = field(form, "contract_id") || null;
  const categoryId = field(form, "category_id") || null;
  const invoiceNumber = field(form, "invoice_number").slice(0, 80);
  const issueDate = field(form, "issue_date");
  let dueDate = field(form, "due_date");
  const netCents = parseEurosToCents(field(form, "net"));
  const rateText = field(form, "vat_rate");
  const notes = field(form, "notes").slice(0, 4000) || null;

  if (!supplierId) return { error: "Please choose the supplier who sent the invoice." };
  if (!invoiceNumber) return { error: "Please type the invoice number. You can find it at the top of the invoice." };
  if (!isIsoDate(issueDate)) return { error: "Please enter the date on the invoice (the issue date)." };
  if (!dueDate) dueDate = addDaysInput(issueDate, 30);
  if (!isIsoDate(dueDate)) return { error: "Please enter a valid due date, or leave it empty for 30 days after the issue date." };
  if (dueDate < issueDate) return { error: "The due date cannot be before the issue date." };
  if (netCents == null || netCents <= 0) return { error: "Please enter the amount before VAT, in euros (for example 850.00)." };
  if (netCents > 10_000_000_000) return { error: "That amount looks too large. Please check it." };
  const rate = VAT_RATES.find((r) => r.value === rateText);
  if (!rate) return { error: "Please choose the VAT rate shown on the invoice." };
  const vatCents = vatFromNet(netCents, Number(rate.value));

  // Everything referenced must belong to this community.
  const [{ data: supplier }, { data: contract }, { data: category }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("id", supplierId).eq("community_id", communityId).maybeSingle(),
    contractId
      ? supabase.from("contracts").select("id, supplier_id").eq("id", contractId).eq("community_id", communityId).maybeSingle()
      : Promise.resolve({ data: null }),
    categoryId
      ? supabase.from("expense_categories").select("id").eq("id", categoryId).eq("community_id", communityId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!supplier) return { error: "Please choose the supplier again. The one selected could not be found." };
  if (contractId && !contract) return { error: "The contract selected could not be found. Please choose it again, or leave it empty." };
  if (contract && (contract as { supplier_id: string }).supplier_id !== supplierId) {
    return { error: "That contract is with a different supplier. Please choose a contract from this supplier, or leave it empty." };
  }
  if (categoryId && !category) return { error: "The category selected could not be found. Please choose it again." };
  const supplierName = (supplier as { name: string }).name;

  // Friendly duplicate check before uploading anything.
  const { data: existing } = await supabase
    .from("invoices").select("id")
    .eq("community_id", communityId).eq("supplier_id", supplierId).eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (existing) {
    return {
      error: `Invoice number “${invoiceNumber}” from ${supplierName} has already been entered. Please check you are not adding it twice.`,
      existingId: (existing as { id: string }).id,
    };
  }

  // Optional attachment: PDF or photo, into the private "finance" bucket.
  let filePath: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) return { error: `“${file.name}” is not a PDF or a photo. Please choose a PDF or an image file.` };
    if (file.size > MAX_FILE_BYTES) return { error: `“${file.name}” is larger than 20 MB. Please choose a smaller file.` };
    const ext = isPdf ? "pdf" : ((file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");
    filePath = `${communityId}/invoices/${randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("finance").upload(filePath, file, {
      contentType: isPdf ? "application/pdf" : file.type,
    });
    if (upErr) return { error: "The file could not be uploaded. Please try again, or save the invoice without the file." };
  }

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      community_id: communityId,
      supplier_id: supplierId,
      contract_id: contractId,
      category_id: categoryId,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      net_cents: netCents,
      vat_cents: vatCents,
      notes,
      file_path: filePath,
      created_by: s.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return { error: `Invoice number “${invoiceNumber}” from ${supplierName} has already been entered. Please check you are not adding it twice.` };
    }
    return { error: "The invoice could not be saved. Please check the details and try again." };
  }

  const newId = (created as { id: string }).id;
  revalidateInvoice(slug, newId);
  redirect(`/${slug}/finance/invoices/${newId}?added=1`);
}

// ---------------------------------------------------------------------------
// Approve (adds the caller's approval; the database flips the status when there are enough)
// ---------------------------------------------------------------------------
export async function approveInvoice(slug: string, id: string): Promise<InvoiceActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const inv = await loadInvoice(supabase, s.community.id, id);
  if (!inv) return { error: "We could not find this invoice." };
  if (inv.status === "approved" || inv.status === "paid") {
    return { message: "This invoice is already approved.", tone: "info" };
  }
  if (inv.status === "disputed") {
    return { error: "This invoice is disputed. Reopen it first if it should be approved." };
  }

  const { data: mine } = await supabase
    .from("invoice_approvals").select("id").eq("invoice_id", id).eq("approver_id", s.userId).maybeSingle();

  const { data: newStatus, error } = await supabase.rpc("approve_invoice", { p_invoice: id });
  if (error) return { error: "Your approval could not be saved. Please try again." };
  revalidateInvoice(slug, id);

  if (newStatus === "approved") {
    return { message: "Approved. The invoice is ready to be paid.", tone: "ok" };
  }
  const required = requiredApprovals(inv.total_cents, approvalThreshold(s.community.settings));
  if (mine) {
    return { message: "You have already approved this invoice. Waiting for another committee member to approve it.", tone: "info" };
  }
  return {
    message: `Thank you, your approval is saved. This invoice needs ${required} approvals, so it is now waiting for another committee member.`,
    tone: "ok",
  };
}

// ---------------------------------------------------------------------------
// Mark as paid
// ---------------------------------------------------------------------------
export async function markInvoicePaid(slug: string, id: string, _prev: InvoiceActionState, form: FormData): Promise<InvoiceActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const paidDate = field(form, "paid_date");
  const today = todayInput(s.community.timezone);

  if (!form.get("confirm")) return { error: "Please tick the box to confirm that this invoice has been paid." };
  if (!isIsoDate(paidDate)) return { error: "Please enter the date the invoice was paid." };
  if (paidDate > today) return { error: "The payment date cannot be in the future." };

  const inv = await loadInvoice(supabase, s.community.id, id);
  if (!inv) return { error: "We could not find this invoice." };
  if (inv.status === "paid") return { message: "This invoice is already marked as paid.", tone: "info" };
  if (inv.status === "disputed") return { error: "This invoice is disputed. Reopen and approve it before marking it as paid." };
  if (paidDate < inv.issue_date) return { error: `The payment date is before the invoice date (${date(inv.issue_date)}). Please check it.` };

  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_date: paidDate })
    .eq("id", id)
    .eq("community_id", s.community.id)
    .select("id");

  if (error) {
    const required = requiredApprovals(inv.total_cents, approvalThreshold(s.community.settings));
    if (error.code === "P0001" || /approval/i.test(error.message)) {
      return {
        error: `This invoice cannot be paid yet. It needs ${required === 1 ? "1 approval" : `${required} approvals`} from committee members first.`,
      };
    }
    return { error: "The invoice could not be marked as paid. Please try again." };
  }
  if (!updated || updated.length === 0) return { error: "You are not allowed to change this invoice." };

  revalidateInvoice(slug, id);
  return { message: `Marked as paid on ${date(paidDate)}.`, tone: "ok" };
}

// ---------------------------------------------------------------------------
// Dispute / reopen
// ---------------------------------------------------------------------------
export async function disputeInvoice(slug: string, id: string, _prev: InvoiceActionState, form: FormData): Promise<InvoiceActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const reason = field(form, "reason").slice(0, 1000);
  if (reason.length < 3) return { error: "Please explain briefly what is wrong with this invoice." };

  const inv = await loadInvoice(supabase, s.community.id, id);
  if (!inv) return { error: "We could not find this invoice." };
  if (inv.status === "disputed") return { message: "This invoice is already disputed.", tone: "info" };
  if (inv.status === "paid") return { error: "This invoice has already been paid, so it cannot be disputed here. Contact the supplier directly." };

  const today = todayInput(s.community.timezone);
  const line = `Disputed on ${date(today)} by ${s.fullName || "a committee member"}: ${reason}`;
  const notes = [inv.notes?.trim(), line].filter(Boolean).join("\n\n");

  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ status: "disputed", notes })
    .eq("id", id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error) return { error: "The invoice could not be marked as disputed. Please try again." };
  if (!updated || updated.length === 0) return { error: "You are not allowed to change this invoice." };

  revalidateInvoice(slug, id);
  return { message: "The invoice is now marked as disputed. It will not be counted in spending until it is reopened.", tone: "ok" };
}

export async function reopenInvoice(slug: string, id: string, _prev: InvoiceActionState, form: FormData): Promise<InvoiceActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const note = field(form, "note").slice(0, 1000);

  const inv = await loadInvoice(supabase, s.community.id, id);
  if (!inv) return { error: "We could not find this invoice." };
  if (inv.status !== "disputed") return { message: "This invoice is not disputed, so there is nothing to reopen.", tone: "info" };

  const today = todayInput(s.community.timezone);
  const line = `Reopened on ${date(today)} by ${s.fullName || "a committee member"}${note ? `: ${note}` : "."}`;
  const notes = [inv.notes?.trim(), line].filter(Boolean).join("\n\n");

  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ status: "received", notes })
    .eq("id", id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error) return { error: "The invoice could not be reopened. Please try again." };
  if (!updated || updated.length === 0) return { error: "You are not allowed to change this invoice." };

  revalidateInvoice(slug, id);
  return { message: "The invoice is open again and waiting for approval.", tone: "ok" };
}
