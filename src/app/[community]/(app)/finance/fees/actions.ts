"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, parseEurosToCents, todayInput } from "@/lib/format";
import { buildMatcher, paymentKey, parseStatementCsv } from "@/components/finance/fees/csv";
import { fetchAll, ownersByUnit } from "@/components/finance/fees/data";
import { FREQUENCIES, PAYMENT_METHODS, REMINDER_CHANNELS, isIsoDate, num, plural } from "@/components/finance/fees/utils";

/** `stamp` changes on every success so the form can clear itself (see useFormAction). */
export type FormState = { error?: string; success?: string; stamp?: string } | undefined;
export type PaymentState = { error?: string; ok?: { amount: number; applied: number; credit: number; stamp: string } } | undefined;

export type PreviewRow = {
  line: number;
  date: string | null;
  rawDate: string;
  description: string;
  amount_cents: number | null;
  rawAmount: string;
  unit_id: string | null;
  reason: string | null;
  candidates: string[];
  problem: string | null;
  duplicate: boolean;
};
export type ParseState = { error?: string; preview?: { parseId: string; fileName: string; rows: PreviewRow[] } } | undefined;
export type ConfirmState = { error?: string; ok?: { parseId: string; recorded: number; totalCents: number; skipped: number } } | undefined;

const MAX_CENTS = 10_000_000_000; // €100 million: anything above is a typing mistake
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINES = 500;

/** Fee changes show up on the finance pages and on owners' "My flat" pages. */
function refresh(slug: string) {
  revalidatePath(`/${slug}/finance`, "layout");
  revalidatePath(`/${slug}/my-units`, "layout");
}

async function unitInCommunity(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, unitId: string) {
  const { data } = await supabase.from("units").select("id, label").eq("id", unitId).eq("community_id", communityId).maybeSingle();
  return data as { id: string; label: string } | null;
}

// ---------------------------------------------------------------------------
// Flat statement: record a payment, log a reminder
// ---------------------------------------------------------------------------
export async function recordPayment(slug: string, unitId: string, _prev: PaymentState, form: FormData): Promise<PaymentState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const today = todayInput(s.community.timezone);

  const unit = await unitInCommunity(supabase, s.community.id, unitId);
  if (!unit) return { error: "This flat could not be found. Please go back to the list of flats and try again." };

  const amount = parseEurosToCents(form.get("amount"));
  if (amount == null || amount <= 0) return { error: "Please enter the amount that was paid, for example 250 or 250,50." };
  if (amount > MAX_CENTS) return { error: "That amount looks too large. Please check it." };

  const paidOn = String(form.get("paid_on") ?? "");
  if (!isIsoDate(paidOn)) return { error: "Please enter the date the money arrived." };
  if (paidOn > today) return { error: "The payment date cannot be in the future." };

  const method = String(form.get("method") ?? "");
  if (!PAYMENT_METHODS.some((m) => m.value === method)) return { error: "Please choose how it was paid." };
  const reference = String(form.get("reference") ?? "").trim().slice(0, 200) || null;

  const { data: inserted, error } = await supabase.from("fee_payments").insert({
    community_id: s.community.id, unit_id: unit.id, paid_on: paidOn, amount_cents: amount,
    method, reference, recorded_by: s.userId,
  }).select("id").single();
  if (error || !inserted) return { error: "The payment could not be saved. Please try again." };

  // The database shares the payment out to the oldest unpaid fees; whatever is left is stored as credit.
  const { data: after } = await supabase.from("fee_payments").select("unallocated_cents").eq("id", inserted.id).maybeSingle();
  const credit = num(after?.unallocated_cents);

  refresh(slug);
  return { ok: { amount, applied: amount - credit, credit, stamp: randomUUID() } };
}

export async function logReminder(slug: string, unitId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const unit = await unitInCommunity(supabase, s.community.id, unitId);
  if (!unit) return { error: "This flat could not be found. Please go back to the list of flats and try again." };

  const channel = String(form.get("channel") ?? "");
  const ch = REMINDER_CHANNELS.find((c) => c.value === channel);
  if (!ch) return { error: "Please choose how the reminder was sent." };
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;

  const { error } = await supabase.from("fee_reminders").insert({
    community_id: s.community.id, unit_id: unit.id, channel, note,
  });
  if (error) return { error: "The reminder could not be saved. Please try again." };

  refresh(slug);
  return { success: `Reminder by ${ch.label.toLowerCase()} logged for flat ${unit.label}.`, stamp: randomUUID() };
}

// ---------------------------------------------------------------------------
// Fee schedule and levies
// ---------------------------------------------------------------------------
export async function createSchedule(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const year = Number(form.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Please choose the year." };
  const frequency = String(form.get("frequency") ?? "");
  if (!FREQUENCIES.some((f) => f.value === frequency)) return { error: "Please choose how often owners pay." };
  const method = String(form.get("method") ?? "");
  if (method !== "coefficient" && method !== "fixed") return { error: "Please choose how the fee is worked out." };

  const cents = parseEurosToCents(form.get(method === "coefficient" ? "annual_total" : "fixed_amount"));
  if (cents == null || cents <= 0) {
    return { error: method === "coefficient" ? "Please enter the total to collect in the year." : "Please enter the amount each flat pays." };
  }
  if (cents > MAX_CENTS) return { error: "That amount looks too large. Please check it." };

  const { data: budget } = await supabase.from("budgets").select("id").eq("community_id", s.community.id).eq("year", year).maybeSingle();

  const { error } = await supabase.from("fee_schedules").insert({
    community_id: s.community.id, year, frequency, method,
    annual_total_cents: method === "coefficient" ? cents : null,
    fixed_amount_cents: method === "fixed" ? cents : null,
    budget_id: budget?.id ?? null, active: true,
  });
  if (error) {
    if (error.code === "23505") return { error: `There is already a fee schedule for ${year}.` };
    return { error: "The fee schedule could not be saved. Please try again." };
  }
  refresh(slug);
  redirect(`/${slug}/finance/fees/schedule?year=${year}&created=1`);
}

export async function generateCharges(slug: string, scheduleId: string): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const { data: sched } = await supabase.from("fee_schedules").select("id, year")
    .eq("id", scheduleId).eq("community_id", s.community.id).maybeSingle();
  if (!sched) return { error: "This fee schedule could not be found." };

  const { data, error } = await supabase.rpc("generate_fee_charges", { p_schedule: sched.id });
  if (error) {
    return { error: "The charges could not be created. Check that the schedule has an amount and that every flat has a share (coefficient)." };
  }
  const n = num(data);
  refresh(slug);
  return {
    success: n === 0
      ? `All charges for ${sched.year} already exist. Nothing new was added.`
      : `Done: ${plural(n, "new charge")} created for ${sched.year}.`,
  };
}

export async function createLevy(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const title = String(form.get("title") ?? "").trim();
  if (title.length < 3) return { error: "Please give the levy a short name, for example “Roof repair 2026”." };
  if (title.length > 120) return { error: "Please keep the name shorter (at most 120 letters)." };
  const description = String(form.get("description") ?? "").trim().slice(0, 2000) || null;
  const total = parseEurosToCents(form.get("total"));
  if (total == null || total <= 0) return { error: "Please enter the total amount to collect." };
  if (total > MAX_CENTS) return { error: "That amount looks too large. Please check it." };
  const due = String(form.get("due_date") ?? "");
  if (!isIsoDate(due)) return { error: "Please enter the date the owners must pay by." };
  if (form.get("confirm") !== "on") return { error: "Please tick the box to confirm that the amount and date are right." };

  const { data: levy, error } = await supabase.from("levies").insert({
    community_id: s.community.id, title, description, total_cents: total, due_date: due,
  }).select("id").single();
  if (error || !levy) return { error: "The levy could not be saved. Please try again." };

  const { data: n, error: allocError } = await supabase.rpc("allocate_levy", { p_levy: levy.id });
  refresh(slug);
  if (allocError) {
    return { error: `The levy “${title}” was saved, but the flats could not be charged yet. Use “Charge the flats” in the list of levies to try again.` };
  }
  return {
    success: `“${title}” was created: ${plural(num(n), "flat")} charged their share of ${money(total, s.community.currency)}, due ${date(due)}.`,
    stamp: randomUUID(),
  };
}

export async function allocateLevy(slug: string, levyId: string): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const { data: levy } = await supabase.from("levies").select("id, title").eq("id", levyId).eq("community_id", s.community.id).maybeSingle();
  if (!levy) return { error: "This levy could not be found." };

  const { data: n, error } = await supabase.rpc("allocate_levy", { p_levy: levy.id });
  if (error) return { error: "The flats could not be charged. Check that every flat has a share (coefficient), then try again." };
  refresh(slug);
  const count = num(n);
  return { success: count === 0 ? `Every flat already has a charge for “${levy.title}”.` : `${plural(count, "flat")} charged for “${levy.title}”.` };
}

// ---------------------------------------------------------------------------
// Bank statement import
// ---------------------------------------------------------------------------
async function existingPaymentKeys(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, dates: string[]) {
  const keys = new Set<string>();
  if (dates.length === 0) return keys;
  const sorted = [...dates].sort();
  const { rows } = await fetchAll<{ paid_on: string; amount_cents: number; reference: string | null }>((from, to) =>
    supabase.from("fee_payments").select("id, paid_on, amount_cents, reference")
      .eq("community_id", communityId).gte("paid_on", sorted[0]).lte("paid_on", sorted[sorted.length - 1])
      .order("id").range(from, to));
  for (const p of rows) keys.add(paymentKey(p.paid_on, num(p.amount_cents), p.reference));
  return keys;
}

export async function parseStatement(slug: string, _prev: ParseState, form: FormData): Promise<ParseState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose the CSV file from your bank." };
  if (file.size > MAX_FILE_BYTES) return { error: "This file is larger than 1 MB. Please export a shorter period from your bank." };
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/i.test(file.type)) {
    return { error: "Please choose a CSV file (it usually ends in .csv). Excel files must first be saved as CSV." };
  }

  // Most banks export UTF-8; some Spanish banks still use Windows-1252 (accents would look broken).
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) {
    try { text = new TextDecoder("windows-1252").decode(buf); } catch { /* keep the UTF-8 text */ }
  }

  const { lines } = parseStatementCsv(text);
  if (lines.length === 0) return { error: "The file is empty." };
  if (lines.length > MAX_LINES) return { error: `The file has ${lines.length} rows. Please import at most ${MAX_LINES} rows at a time.` };
  if (!lines.some((l) => l.date && l.amount_cents != null)) {
    return { error: "No dates and amounts could be read. The file needs three columns: date, description and amount." };
  }

  const today = todayInput(s.community.timezone);
  const [{ rows: balances }, { rows: units }] = await Promise.all([
    fetchAll<{ unit_id: string; owner_names: string | null }>((from, to) =>
      supabase.from("v_unit_balance").select("unit_id, owner_names").eq("community_id", s.community.id).order("unit_id").range(from, to)),
    fetchAll<{ id: string; label: string }>((from, to) =>
      supabase.from("units").select("id, label").eq("community_id", s.community.id).order("label").range(from, to)),
  ]);
  const owners = await ownersByUnit(supabase, s.community.id, today, new Map(balances.map((b) => [b.unit_id, b.owner_names])));
  const match = buildMatcher(units.map((u) => ({ id: u.id, label: u.label, ownerNames: owners.get(u.id) ?? [] })));
  const dupes = await existingPaymentKeys(supabase, s.community.id, lines.map((l) => l.date).filter((d): d is string => !!d));

  const rows: PreviewRow[] = lines.map((l) => {
    const problem = !l.date ? "Date not recognised"
      : l.amount_cents == null ? "Amount not recognised"
      : l.amount_cents <= 0 ? "Money going out, or zero: not a fee payment"
      : l.date > today ? "Date is in the future"
      : null;
    const m = problem ? { unitId: null, reason: null, candidates: [] as string[] } : match(l.description);
    return {
      line: l.line, date: l.date, rawDate: l.rawDate, description: l.description,
      amount_cents: l.amount_cents, rawAmount: l.rawAmount,
      unit_id: m.unitId, reason: m.reason, candidates: m.candidates, problem,
      duplicate: !problem && dupes.has(paymentKey(l.date!, l.amount_cents!, l.description)),
    };
  });

  return { preview: { parseId: randomUUID(), fileName: file.name, rows } };
}

type ConfirmRow = { line: number; date: string; description: string; amount_cents: number; unit_id: string | null; duplicate: boolean };

function readConfirmRows(raw: FormDataEntryValue | null): ConfirmRow[] | null {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(parsed)) return null;
    const out: ConfirmRow[] = [];
    for (const r of parsed as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const line = Number(r.line);
      const amount = Number(r.amount_cents);
      const d = String(r.date ?? "");
      if (!Number.isInteger(line) || !isIsoDate(d) || !Number.isInteger(amount) || amount <= 0 || amount > MAX_CENTS) continue;
      out.push({
        line, date: d, amount_cents: amount,
        description: String(r.description ?? "").slice(0, 300),
        unit_id: typeof r.unit_id === "string" && r.unit_id ? r.unit_id : null,
        duplicate: r.duplicate === true,
      });
    }
    return out.slice(0, MAX_LINES);
  } catch {
    return null;
  }
}

export async function confirmImport(slug: string, _prev: ConfirmState, form: FormData): Promise<ConfirmState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const parseId = String(form.get("parseId") ?? "");

  const parsedRows = readConfirmRows(form.get("rows"));
  if (!parsedRows) return { error: "The preview could not be read. Please upload the file again." };
  const today = todayInput(s.community.timezone);
  const rows = parsedRows.filter((r) => r.date <= today);

  const { rows: units } = await fetchAll<{ id: string }>((from, to) =>
    supabase.from("units").select("id").eq("community_id", s.community.id).order("id").range(from, to));
  const validUnits = new Set(units.map((u) => u.id));

  const chosen = rows
    .map((r) => {
      const unitId = r.unit_id
        ? (form.get(`use_${r.line}`) === "on" ? r.unit_id : "")
        : String(form.get(`unit_${r.line}`) ?? "");
      return { ...r, unitId };
    })
    .filter((r) => r.unitId && validUnits.has(r.unitId));
  if (chosen.length === 0) return { error: "No payments were selected. Tick at least one row, or choose a flat for it." };

  // Protect against the same preview being confirmed twice: rows that were new at preview time
  // but are now already recorded are skipped. Rows the preview marked "already recorded" are only
  // here because the user ticked or chose them on purpose, so they are kept.
  const existing = await existingPaymentKeys(supabase, s.community.id, chosen.map((r) => r.date));
  const toInsert = chosen.filter((r) => r.duplicate || !existing.has(paymentKey(r.date, r.amount_cents, r.description)));
  const skipped = chosen.length - toInsert.length;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("fee_payments").insert(toInsert.map((r) => ({
      community_id: s.community.id, unit_id: r.unitId, paid_on: r.date, amount_cents: r.amount_cents,
      method: "bank_transfer", reference: r.description || null, recorded_by: s.userId,
    })));
    if (error) return { error: "The payments could not be saved. Nothing was recorded. Please try again." };
    refresh(slug);
  }

  return {
    ok: { parseId, recorded: toInsert.length, totalCents: toInsert.reduce((t, r) => t + r.amount_cents, 0), skipped },
  };
}
