"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/community";
import { parseEurosToCents, todayInput } from "@/lib/format";
import { failWith, text, UUID, type ActionState, type FormState } from "@/components/finance/register/form";
import { isIsoDate } from "@/components/finance/register/dates";

const validYear = (y: number) => Number.isInteger(y) && y >= 2000 && y <= 2100;

function revalidateBudget(slug: string) {
  revalidatePath(`/${slug}/finance/budget`);
  revalidatePath(`/${slug}/finance/budget/edit`);
  revalidatePath(`/${slug}/finance`);
  revalidatePath(`/${slug}/money`);
}

/** Start an empty draft budget for a year (only if that year has none). */
export async function createBudget(slug: string, year: number): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  if (!validYear(year)) return { error: "That year is not valid." };

  const { data: existing } = await supabase.from("budgets").select("id").eq("community_id", s.community.id).eq("year", year).maybeSingle();
  if (existing) return { error: `There is already a budget for ${year}.` };

  const { error } = await supabase.from("budgets").insert({ community_id: s.community.id, year, name: `Budget ${year}`, status: "draft" });
  if (error) {
    return { error: error.code === "23505" ? `There is already a budget for ${year}.` : "The budget could not be created. Please try again." };
  }
  revalidateBudget(slug);
  redirect(`/${slug}/finance/budget/edit?year=${year}`);
}

/** Create next year's budget as a draft, copying this year's amounts. Does nothing if it already exists. */
export async function startNextYearBudget(slug: string, fromYear: number): Promise<ActionState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  if (!validYear(fromYear) || !validYear(fromYear + 1)) return { error: "That year is not valid." };
  const toYear = fromYear + 1;
  const cid = s.community.id;

  const [{ data: from }, { data: existing }] = await Promise.all([
    supabase.from("budgets").select("id").eq("community_id", cid).eq("year", fromYear).maybeSingle(),
    supabase.from("budgets").select("id").eq("community_id", cid).eq("year", toYear).maybeSingle(),
  ]);
  if (existing) return { error: `There is already a budget for ${toYear}. Choose ${toYear} in the year list to see it.` };
  if (!from) return { error: `There is no ${fromYear} budget to copy from.` };

  const { data: lines, error: linesError } = await supabase.from("budget_lines").select("category_id, amount_cents").eq("budget_id", from.id);
  if (linesError) return { error: "The budget could not be copied. Please try again." };

  const { data: created, error } = await supabase
    .from("budgets")
    .insert({ community_id: cid, year: toYear, name: `Budget ${toYear}`, status: "draft" })
    .select("id")
    .single();
  if (error || !created) {
    return { error: error?.code === "23505" ? `There is already a budget for ${toYear}.` : "The budget could not be created. Please try again." };
  }

  const copy = ((lines ?? []) as { category_id: string; amount_cents: number }[]).map((l) => ({
    community_id: cid, budget_id: created.id, category_id: l.category_id, amount_cents: l.amount_cents,
  }));
  if (copy.length > 0) {
    const { error: copyError } = await supabase.from("budget_lines").insert(copy);
    if (copyError) {
      // Do not leave a half-made budget behind.
      await supabase.from("budgets").delete().eq("id", created.id).eq("community_id", cid);
      return { error: "The amounts could not be copied. Nothing was changed. Please try again." };
    }
  }

  revalidateBudget(slug);
  redirect(`/${slug}/finance/budget?year=${toYear}&started=1`);
}

/** Save the budget's name, status and one amount per expense category. */
export async function saveBudget(slug: string, budgetId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const cid = s.community.id;
  if (!UUID.test(budgetId)) return failWith("This budget could not be found.", form);

  const [{ data: budget }, { data: cats }] = await Promise.all([
    supabase.from("budgets").select("id, year").eq("id", budgetId).eq("community_id", cid).maybeSingle(),
    supabase.from("expense_categories").select("id, name").eq("community_id", cid),
  ]);
  if (!budget) return failWith("This budget could not be found. It may have been deleted.", form);

  const name = text(form, "name") || `Budget ${budget.year}`;
  if (name.length > 120) return failWith("The budget name is too long. Please keep it under 120 characters.", form);
  const status = text(form, "status");
  if (status !== "draft" && status !== "approved") return failWith("Please choose whether the budget is a draft or approved.", form);
  let approvedAt: string | null = null;
  if (status === "approved") {
    approvedAt = text(form, "approved_at") || todayInput(s.community.timezone);
    if (!isIsoDate(approvedAt)) return failWith("The approval date is not a valid date.", form);
  }

  const upserts: { community_id: string; budget_id: string; category_id: string; amount_cents: number }[] = [];
  const removals: string[] = [];
  for (const c of (cats ?? []) as { id: string; name: string }[]) {
    const raw = text(form, `amount_${c.id}`);
    if (!raw) {
      removals.push(c.id);
      continue;
    }
    const cents = parseEurosToCents(raw);
    if (cents == null) return failWith(`The amount for “${c.name}” is not a number. Please use digits, for example 12000 or 12.000,50.`, form);
    if (cents < 0) return failWith(`The amount for “${c.name}” cannot be below zero.`, form);
    upserts.push({ community_id: cid, budget_id: budget.id, category_id: c.id, amount_cents: cents });
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from("budget_lines").upsert(upserts, { onConflict: "budget_id,category_id" });
    if (error) return failWith("The amounts could not be saved. Please try again.", form);
  }
  if (removals.length > 0) {
    const { error } = await supabase.from("budget_lines").delete().eq("budget_id", budget.id).in("category_id", removals);
    if (error) return failWith("Some empty lines could not be removed. Please try again.", form);
  }

  const { error: metaError } = await supabase.from("budgets")
    .update({ name, status, approved_at: approvedAt })
    .eq("id", budget.id).eq("community_id", cid);
  if (metaError) return failWith("The budget details could not be saved. Please try again.", form);

  revalidateBudget(slug);
  redirect(`/${slug}/finance/budget?year=${budget.year}&saved=1`);
}
