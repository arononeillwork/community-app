"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, type Session } from "@/lib/community";
import { parseEurosToCents, todayInput, date as fmtDate } from "@/lib/format";
import {
  ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, VAT_RATES, requiredApprovals, safeFileName, vatFor,
} from "@/components/finance/invoice";

export type InvoiceValues = Record<string, string>;
export type Duplicate = { id: string; invoice_number: string; issue_date: string; total_cents: number; status: string };
export type InvoiceFormState = {
  error?: string;
  fields?: Record<string, string>;
  values?: InvoiceValues;
  /** Likely duplicates: the person can look, then save anyway. */
  duplicates?: Duplicate[];
} | undefined;
export type ActionState = { error?: string } | undefined;

const FIELDS = ["supplier_id", "category_id", "contract_id", "invoice_number", "issue_date", "due_date", "net", "vat_rate", "notes"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 100_000_000_00; // €100 million: anything above is a typo

function validDate(v: string) {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Parsed = {
  supplier_id: string; category_id: string | null; contract_id: string | null; invoice_number: string;
  issue_date: string; due_date: string | null; net_cents: number; vat_cents: number; notes: string | null;
};

/** Validate the invoice form on the server. Every reference is checked against this community. */
async function parseInvoice(s: Session, form: FormData) {
  const supabase = await createClient();
  const values: InvoiceValues = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "").trim()]));
  const fields: Record<string, string> = {};
  const c = s.community.id;

  const invoiceNumber = values.invoice_number.replace(/\s+/g, " ");
  if (!invoiceNumber) fields.invoice_number = "Enter the number printed on the invoice.";
  else if (invoiceNumber.length > 60) fields.invoice_number = "Keep the invoice number under 60 characters.";

  const [{ data: supplier }, { data: category }, { data: contract }] = await Promise.all([
    values.supplier_id
      ? supabase.from("suppliers").select("id, name").eq("community_id", c).eq("id", values.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    values.category_id
      ? supabase.from("expense_categories").select("id").eq("community_id", c).eq("id", values.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    values.contract_id
      ? supabase.from("contracts").select("id, supplier_id").eq("community_id", c).eq("id", values.contract_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!supplier) fields.supplier_id = "Choose the supplier who sent the invoice.";
  if (values.category_id && !category) fields.category_id = "Choose a category from the list.";
  if (values.contract_id && (!contract || contract.supplier_id !== values.supplier_id)) {
    fields.contract_id = "That contract is not with this supplier.";
  }

  if (!validDate(values.issue_date)) fields.issue_date = "Enter the date on the invoice.";
  else if (values.issue_date > addDays(todayInput(s.community.timezone), 1)) fields.issue_date = "The invoice date cannot be in the future.";
  if (values.due_date && !validDate(values.due_date)) fields.due_date = "Enter a valid due date, or leave it empty.";
  else if (values.due_date && validDate(values.issue_date) && values.due_date < values.issue_date) {
    fields.due_date = "The due date is before the invoice date.";
  }

  const net = parseEurosToCents(values.net);
  if (net == null || !values.net) fields.net = "Enter the amount before VAT, for example 1250.00.";
  else if (net < 0) fields.net = "The amount cannot be negative. For a credit note, add a note and contact the supplier.";
  else if (net > MAX_CENTS) fields.net = "That amount looks too large. Please check it.";

  const rate = Number(values.vat_rate);
  if (!VAT_RATES.includes(rate as (typeof VAT_RATES)[number])) fields.vat_rate = "Choose the VAT rate.";

  const notes = values.notes.slice(0, 2000);

  const parsed: Parsed | null = Object.keys(fields).length ? null : {
    supplier_id: values.supplier_id,
    category_id: values.category_id || null,
    contract_id: values.contract_id || null,
    invoice_number: invoiceNumber,
    issue_date: values.issue_date,
    due_date: values.due_date || null,
    net_cents: net!,
    vat_cents: vatFor(net!, rate),
    notes: notes || null,
  };
  return { parsed, fields, values, supplierName: supplier?.name ?? "" };
}

function readAttachment(form: FormData): { file: File | null; error?: string } {
  const f = form.get("attachment");
  if (!(f instanceof File) || f.size === 0) return { file: null };
  if (!ATTACHMENT_TYPES.includes(f.type)) return { file: null, error: "Attach a PDF or a photo (JPG, PNG, WebP or HEIC)." };
  if (f.size > ATTACHMENT_MAX_BYTES) return { file: null, error: "The file is larger than 20 MB. Please attach a smaller copy." };
  return { file: f };
}

const normalNumber = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Same supplier with the same (or nearly the same) number, or the same total within 30 days. */
async function findDuplicates(s: Session, p: Parsed, exceptId?: string) {
  const supabase = await createClient();
  const total = p.net_cents + p.vat_cents;
  const { data } = await supabase.from("invoices")
    .select("id, invoice_number, issue_date, total_cents, status")
    .eq("community_id", s.community.id).eq("supplier_id", p.supplier_id)
    .gte("issue_date", addDays(p.issue_date, -400)).lte("issue_date", addDays(p.issue_date, 400));
  const { data: sameNumber } = await supabase.from("invoices")
    .select("id, invoice_number, issue_date, total_cents, status")
    .eq("community_id", s.community.id).eq("supplier_id", p.supplier_id).eq("invoice_number", p.invoice_number);
  const from = addDays(p.issue_date, -30), to = addDays(p.issue_date, 30);
  const found = [...(sameNumber ?? []), ...(data ?? [])].filter((d, i, arr) =>
    d.id !== exceptId && arr.findIndex((x) => x.id === d.id) === i && (
      normalNumber(d.invoice_number) === normalNumber(p.invoice_number)
      || (Number(d.total_cents) === total && d.issue_date >= from && d.issue_date <= to)
    ));
  return found.slice(0, 5) as Duplicate[];
}

async function uploadAttachment(s: Session, file: File) {
  const supabase = await createClient();
  const path = `${s.community.id}/invoices/${randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from("finance").upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

async function removeAttachment(path: string | null | undefined) {
  if (!path) return;
  const supabase = await createClient();
  await supabase.storage.from("finance").remove([path]);
}

function exactNumberClash(dups: Duplicate[], number: string) {
  return dups.find((d) => d.invoice_number === number);
}

export async function createInvoice(slug: string, _prev: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  const s = await requireFinance(slug);
  const { parsed, fields, values, supplierName } = await parseInvoice(s, form);
  const { file, error: fileError } = readAttachment(form);
  if (fileError) fields.attachment = fileError;
  if (!parsed || fileError) return { error: "Please check the highlighted fields.", fields, values };

  const dups = await findDuplicates(s, parsed);
  const clash = exactNumberClash(dups, parsed.invoice_number);
  if (clash) {
    return {
      error: `${supplierName} already has invoice ${clash.invoice_number}, dated ${fmtDate(clash.issue_date)}. Open it from the list, or check the number.`,
      fields: { invoice_number: "This number is already recorded for this supplier." }, values, duplicates: [clash],
    };
  }
  if (dups.length && form.get("confirm_duplicate") !== "1") {
    return { values, duplicates: dups };
  }

  const supabase = await createClient();
  const id = randomUUID();
  const path = file ? await uploadAttachment(s, file) : null;
  if (file && !path) return { error: "The file could not be uploaded. Please try again.", fields: {}, values };

  const { error } = await supabase.from("invoices").insert({
    id, community_id: s.community.id, created_by: s.userId, ...parsed, file_path: path,
  });
  if (error) {
    await removeAttachment(path);
    return {
      error: error.code === "23505" ? "This supplier already has an invoice with that number." : "The invoice could not be saved. Please try again.",
      fields: {}, values,
    };
  }

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=added`);
}

export async function updateInvoice(slug: string, id: string, _prev: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("invoices").select("id, status, file_path")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!existing) return { error: "This invoice no longer exists." };
  if (existing.status !== "received") return { error: "Only invoices awaiting approval can be edited." };

  const { parsed, fields, values, supplierName } = await parseInvoice(s, form);
  const { file, error: fileError } = readAttachment(form);
  if (fileError) fields.attachment = fileError;
  if (!parsed || fileError) return { error: "Please check the highlighted fields.", fields, values };

  const dups = await findDuplicates(s, parsed, id);
  const clash = exactNumberClash(dups, parsed.invoice_number);
  if (clash) {
    return {
      error: `${supplierName} already has invoice ${clash.invoice_number}, dated ${fmtDate(clash.issue_date)}.`,
      fields: { invoice_number: "This number is already recorded for this supplier." }, values, duplicates: [clash],
    };
  }
  if (dups.length && form.get("confirm_duplicate") !== "1") return { values, duplicates: dups };

  const removing = form.get("remove_attachment") === "1";
  const newPath = file ? await uploadAttachment(s, file) : null;
  if (file && !newPath) return { error: "The file could not be uploaded. Please try again.", fields: {}, values };
  const file_path = newPath ?? (removing ? null : existing.file_path);

  const { error } = await supabase.from("invoices").update({ ...parsed, file_path })
    .eq("community_id", s.community.id).eq("id", id);
  if (error) {
    await removeAttachment(newPath);
    return {
      error: error.code === "23505" ? "This supplier already has an invoice with that number." : "The changes could not be saved. Please try again.",
      fields: {}, values,
    };
  }
  if (existing.file_path && existing.file_path !== file_path) await removeAttachment(existing.file_path);

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=updated`);
}

export async function approveInvoice(slug: string, id: string): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("id, status").eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!inv) return { error: "This invoice no longer exists." };
  if (inv.status !== "received") return { error: "This invoice is no longer waiting for approval." };
  const { data: mine } = await supabase.from("invoice_approvals").select("id").eq("invoice_id", id).eq("approver_id", s.userId).maybeSingle();
  if (mine) return { error: "You have already approved this invoice. It needs someone else's approval." };

  const { data: status, error } = await supabase.rpc("approve_invoice", { p_invoice: id });
  if (error) return { error: "Your approval could not be recorded. Please try again." };

  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=${status === "approved" ? "approved" : "approval"}`);
}

export async function markInvoicePaid(slug: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const paidDate = String(form.get("paid_date") ?? "").trim();
  const { data: inv } = await supabase.from("invoices").select("id, status, issue_date, net_cents, vat_cents")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!inv) return { error: "This invoice no longer exists." };
  if (inv.status !== "approved") {
    const need = requiredApprovals(Number(inv.net_cents) + Number(inv.vat_cents), s.community.settings?.invoice_approval_threshold_cents);
    return { error: inv.status === "paid" ? "This invoice is already paid." : `The invoice needs ${need} ${need === 1 ? "approval" : "approvals"} before it can be paid.` };
  }
  if (!validDate(paidDate)) return { error: "Enter the date the payment left the bank." };
  if (paidDate > todayInput(s.community.timezone)) return { error: "The payment date cannot be in the future." };
  if (paidDate < inv.issue_date) return { error: `The payment date is before the invoice date (${fmtDate(inv.issue_date)}).` };

  const { error } = await supabase.from("invoices").update({ status: "paid", paid_date: paidDate })
    .eq("community_id", s.community.id).eq("id", id);
  if (error) {
    return { error: /approval/i.test(error.message) ? "The invoice does not have enough approvals to be paid." : "The payment could not be saved. Please try again." };
  }
  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=paid`);
}

export async function disputeInvoice(slug: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const reason = String(form.get("reason") ?? "").trim().replace(/\s+\n/g, "\n");
  if (reason.length < 5) return { error: "Say briefly what is wrong, so the supplier and the committee know." };
  if (reason.length > 1000) return { error: "Please keep the reason under 1,000 characters." };
  const { data: inv } = await supabase.from("invoices").select("id, status").eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!inv) return { error: "This invoice no longer exists." };
  if (inv.status !== "received" && inv.status !== "approved") return { error: "Only unpaid invoices can be disputed." };

  const { error } = await supabase.from("invoices").update({ status: "disputed", dispute_reason: reason })
    .eq("community_id", s.community.id).eq("id", id);
  if (error) return { error: "The dispute could not be saved. Please try again." };
  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=disputed`);
}

export async function reopenInvoice(slug: string, id: string): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("id, status, net_cents, vat_cents")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!inv) return { error: "This invoice no longer exists." };
  if (inv.status !== "disputed") return { error: "This invoice is not disputed." };
  const { count } = await supabase.from("invoice_approvals").select("id", { count: "exact", head: true }).eq("invoice_id", id);
  const need = requiredApprovals(Number(inv.net_cents) + Number(inv.vat_cents), s.community.settings?.invoice_approval_threshold_cents);
  const status = (count ?? 0) >= need ? "approved" : "received";

  const { error } = await supabase.from("invoices").update({ status, dispute_reason: null })
    .eq("community_id", s.community.id).eq("id", id);
  if (error) return { error: "The invoice could not be reopened. Please try again." };
  revalidatePath(`/${slug}/finance`, "layout");
  redirect(`/${slug}/finance/invoices/${id}?saved=reopened`);
}
