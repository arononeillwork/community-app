"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents, todayInput } from "@/lib/format";
import { isDate, METHODS } from "@/components/finance-ops/dates";

export type FeeFormState = { error?: string; values?: Record<string, string> } | undefined;

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);
const valuesOf = (form: FormData) => {
  const v: Record<string, string> = {};
  for (const [k, x] of form.entries()) if (typeof x === "string") v[k] = x;
  return v;
};

function refresh(slug: string) {
  revalidatePath(`/${slug}/finance`, "layout");
  revalidatePath(`/${slug}/my-units`, "layout");
}

/** Record an owner's payment. The database allocates it to the flat's oldest open charges. */
export async function recordPayment(slug: string, _prev: FeeFormState, form: FormData): Promise<FeeFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const values = valuesOf(form);
  const fail = (error: string): FeeFormState => ({ error, values });

  const unitId = text(form, "unit_id", 64);
  if (!unitId) return fail("Please choose the flat.");
  const { data: unit } = await supabase.from("units").select("id").eq("community_id", c).eq("id", unitId).maybeSingle();
  if (!unit) return fail("That flat was not found.");

  const today = todayInput(s.community.timezone);
  const paidOn = text(form, "paid_on", 10);
  if (!isDate(paidOn)) return fail("Please enter the date the money arrived.");
  if (paidOn > today) return fail("The payment date cannot be in the future.");
  if (paidOn < "2000-01-01") return fail("Please check the payment date.");

  const amount = parseEurosToCents(form.get("amount"));
  if (amount == null || amount <= 0) return fail("Please enter the amount received, e.g. 710.86.");
  if (amount > 10_000_000) return fail("That amount looks too large for one payment. Please check it.");

  const method = text(form, "method", 20);
  if (!METHODS.some((m) => m.value === method)) return fail("Please choose how it was paid.");

  const { data, error } = await supabase.from("fee_payments").insert({
    community_id: c, unit_id: unit.id, paid_on: paidOn, amount_cents: amount, method,
    reference: text(form, "reference", 140) || null, recorded_by: s.userId,
  }).select("id").single();
  if (error || !data) return fail("The payment could not be saved. Please try again.");

  refresh(slug);
  redirect(`/${slug}/finance/fees/${unit.id}?paid=${data.id}`);
}

/** Remove a payment recorded by mistake. The database gives the money back to the charges it paid. */
export async function deletePayment(slug: string, unitId: string, paymentId: string) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { error, count } = await supabase.from("fee_payments").delete({ count: "exact" })
    .eq("community_id", s.community.id).eq("unit_id", unitId).eq("id", paymentId);
  refresh(slug);
  redirect(`/${slug}/finance/fees/${unitId}?${error || !count ? "error=delete" : "removed=1"}`);
}

/** Log a reminder and notify the flat's current owners in the app. */
export async function sendReminder(slug: string, unitId: string, form: FormData) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: unit } = await supabase.from("units").select("id").eq("community_id", s.community.id).eq("id", unitId).maybeSingle();
  if (!unit) redirect(`/${slug}/finance/fees`);
  const { data, error } = await supabase.rpc("send_fee_reminder", { p_unit: unit.id, p_note: text(form, "note", 500) || null });
  refresh(slug);
  redirect(`/${slug}/finance/fees/${unit.id}?${error ? "error=remind" : `reminded=${Number(data) || 0}`}`);
}

/** Create the charges for every flat from a fee schedule. Existing periods are skipped by the database. */
export async function generateCharges(slug: string, scheduleId: string) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: schedule } = await supabase.from("fee_schedules").select("id, year").eq("community_id", s.community.id).eq("id", scheduleId).maybeSingle();
  if (!schedule) redirect(`/${slug}/finance/fees`);
  const { data, error } = await supabase.rpc("generate_fee_charges", { p_schedule: schedule.id });
  refresh(slug);
  redirect(`/${slug}/finance/fees?${error ? "error=generate" : `generated=${Number(data) || 0}&year=${schedule.year}`}`);
}

/** Set up the fee schedule for a year. */
export async function createSchedule(slug: string, _prev: FeeFormState, form: FormData): Promise<FeeFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const values = valuesOf(form);
  const fail = (error: string): FeeFormState => ({ error, values });

  const year = Number(text(form, "year", 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Please enter a valid year.");
  const frequency = text(form, "frequency", 20);
  if (!["monthly", "quarterly", "yearly"].includes(frequency)) return fail("Please choose how often owners pay.");
  const method = text(form, "method", 20);
  if (!["coefficient", "fixed"].includes(method)) return fail("Please choose how the fees are split.");

  let annual: number | null = null;
  let fixed: number | null = null;
  if (method === "coefficient") {
    annual = parseEurosToCents(form.get("annual_total"));
    if (annual == null || annual <= 0) return fail("Please enter the total to collect in the year.");
  } else {
    fixed = parseEurosToCents(form.get("fixed_amount"));
    if (fixed == null || fixed <= 0) return fail("Please enter the amount each flat pays per period.");
  }

  const { data: existing } = await supabase.from("fee_schedules").select("id").eq("community_id", c).eq("year", year).maybeSingle();
  if (existing) return fail(`There is already a fee schedule for ${year}.`);
  const { data: budget } = await supabase.from("budgets").select("id").eq("community_id", c).eq("year", year).maybeSingle();

  const { error } = await supabase.from("fee_schedules").insert({
    community_id: c, year, budget_id: budget?.id ?? null, frequency, method,
    annual_total_cents: annual, fixed_amount_cents: fixed, active: true,
  });
  if (error) return fail("The schedule could not be saved. Please try again.");
  refresh(slug);
  redirect(`/${slug}/finance/fees?schedule=created&year=${year}`);
}

/** Remove a schedule that has no charges yet (e.g. set up with the wrong amount). */
export async function deleteSchedule(slug: string, scheduleId: string) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const { count } = await supabase.from("fee_charges").select("id", { count: "exact", head: true }).eq("community_id", c).eq("schedule_id", scheduleId);
  if (count) redirect(`/${slug}/finance/fees?error=schedule_in_use`);
  const { error } = await supabase.from("fee_schedules").delete().eq("community_id", c).eq("id", scheduleId);
  refresh(slug);
  redirect(`/${slug}/finance/fees?${error ? "error=schedule_delete" : "schedule=deleted"}`);
}

/** Create an extraordinary levy (derrama), optionally splitting it across the flats straight away. */
export async function createLevy(slug: string, _prev: FeeFormState, form: FormData): Promise<FeeFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const values = valuesOf(form);
  const fail = (error: string): FeeFormState => ({ error, values });

  const title = text(form, "title", 120);
  if (title.length < 3) return fail("Please give the levy a short title, e.g. Roof works levy.");
  const total = parseEurosToCents(form.get("total"));
  if (total == null || total <= 0) return fail("Please enter the total amount to collect.");
  if (total > 100_000_000_00) return fail("That amount looks too large. Please check it.");
  const due = text(form, "due_date", 10);
  if (!isDate(due)) return fail("Please enter the date owners must pay by.");

  const { data, error } = await supabase.from("levies").insert({
    community_id: c, title, description: text(form, "description", 1000) || null, total_cents: total, due_date: due,
  }).select("id").single();
  if (error || !data) return fail("The levy could not be saved. Please try again.");

  let split = 0;
  if (form.get("split") === "on") {
    const res = await supabase.rpc("allocate_levy", { p_levy: data.id });
    if (res.error) {
      refresh(slug);
      redirect(`/${slug}/finance/fees?tab=levies&error=split`);
    }
    split = Number(res.data) || 0;
  }
  refresh(slug);
  redirect(`/${slug}/finance/fees?tab=levies&levy=${split ? `split&n=${split}` : "created"}`);
}

/** Split an existing levy across all flats by participation coefficient. */
export async function splitLevy(slug: string, levyId: string) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const { data: levy } = await supabase.from("levies").select("id").eq("community_id", s.community.id).eq("id", levyId).maybeSingle();
  if (!levy) redirect(`/${slug}/finance/fees?tab=levies`);
  const { data, error } = await supabase.rpc("allocate_levy", { p_levy: levy.id });
  refresh(slug);
  redirect(`/${slug}/finance/fees?tab=levies&${error ? "error=split" : `levy=split&n=${Number(data) || 0}`}`);
}
