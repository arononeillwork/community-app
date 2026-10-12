"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { parseEurosToCents, todayInput } from "@/lib/format";
import { isDate } from "@/components/finance-ops/dates";

export type BudgetFormState = { error?: string; values?: Record<string, string> } | undefined;

const page = (slug: string, year: number, extra = "") => `/${slug}/finance/budget?year=${year}${extra}`;

function done(slug: string, year: number, extra: string): never {
  revalidatePath(`/${slug}/finance`, "layout");
  redirect(page(slug, year, extra));
}

/** Create a draft budget for a year: empty, or copied from another year's budget. */
export async function createBudget(slug: string, form: FormData) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const year = Number(form.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) redirect(`/${slug}/finance/budget`);

  const { data: exists } = await supabase.from("budgets").select("id").eq("community_id", c).eq("year", year).maybeSingle();
  if (exists) done(slug, year, "&error=exists");

  const fromYear = Number(form.get("from_year"));
  let lines: { category_id: string; amount_cents: number }[] = [];
  if (Number.isInteger(fromYear) && fromYear > 0) {
    const { data: source } = await supabase.from("budgets").select("id").eq("community_id", c).eq("year", fromYear).maybeSingle();
    if (source) {
      const { data } = await supabase.from("budget_lines").select("category_id, amount_cents").eq("community_id", c).eq("budget_id", source.id);
      lines = data ?? [];
    }
  }

  const { data: budget, error } = await supabase.from("budgets")
    .insert({ community_id: c, year, name: `Budget ${year}`, status: "draft" }).select("id").single();
  if (error || !budget) done(slug, year, "&error=create");
  if (lines.length) {
    const { error: copyError } = await supabase.from("budget_lines")
      .insert(lines.map((l) => ({ community_id: c, budget_id: budget.id, category_id: l.category_id, amount_cents: l.amount_cents })));
    if (copyError) done(slug, year, "&error=copy");
  }
  done(slug, year, lines.length ? "&saved=copied" : "&saved=created&edit=1");
}

/** Save the amount per category on a draft budget. Empty amount = no line for that category. */
export async function saveBudgetLines(slug: string, budgetId: string, _prev: BudgetFormState, form: FormData): Promise<BudgetFormState> {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;

  const { data: budget } = await supabase.from("budgets").select("id, year, status").eq("community_id", c).eq("id", budgetId).maybeSingle();
  if (!budget) return { error: "This budget was not found.", values };
  if (budget.status !== "draft") return { error: "This budget has been approved at the AGM and can no longer be changed.", values };

  const { data: categories } = await supabase.from("expense_categories").select("id, name").eq("community_id", c);
  const upserts: { community_id: string; budget_id: string; category_id: string; amount_cents: number }[] = [];
  const remove: string[] = [];
  for (const cat of categories ?? []) {
    const raw = String(form.get(`amount_${cat.id}`) ?? "").trim();
    if (!raw) { remove.push(cat.id); continue; }
    const cents = parseEurosToCents(raw);
    if (cents == null || cents < 0) return { error: `The amount for ${cat.name} is not a valid amount.`, values };
    if (cents > 100_000_000_00) return { error: `The amount for ${cat.name} looks too large. Please check it.`, values };
    upserts.push({ community_id: c, budget_id: budget.id, category_id: cat.id, amount_cents: cents });
  }
  if (!upserts.length) return { error: "Please enter an amount for at least one category.", values };

  // Only write lines that changed, so the audit log shows what was actually edited.
  const { data: current } = await supabase.from("budget_lines").select("category_id, amount_cents").eq("community_id", c).eq("budget_id", budget.id);
  const before = new Map((current ?? []).map((l) => [l.category_id, Number(l.amount_cents)]));
  const changed = upserts.filter((u) => before.get(u.category_id) !== u.amount_cents);
  const { error } = changed.length ? await supabase.from("budget_lines").upsert(changed, { onConflict: "budget_id,category_id" }) : { error: null };
  if (error) return { error: "The budget could not be saved. Please try again.", values };
  const emptied = remove.filter((id) => before.has(id));
  if (emptied.length) {
    const { error: delError } = await supabase.from("budget_lines").delete().eq("community_id", c).eq("budget_id", budget.id).in("category_id", emptied);
    if (delError) return { error: "Some empty lines could not be removed. Please try again.", values };
  }
  done(slug, budget.year, "&saved=lines");
}

/** Record that the AGM approved the budget. Approved budgets can no longer be edited. */
export async function approveBudget(slug: string, budgetId: string, form: FormData) {
  const s = await requireFinance(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const { data: budget } = await supabase.from("budgets").select("id, year, status").eq("community_id", c).eq("id", budgetId).maybeSingle();
  if (!budget) redirect(`/${slug}/finance/budget`);
  if (budget.status !== "draft") done(slug, budget.year, "");

  const { count } = await supabase.from("budget_lines").select("category_id", { count: "exact", head: true })
    .eq("budget_id", budget.id).gt("amount_cents", 0);
  if (!count) done(slug, budget.year, "&error=empty");

  let agm = String(form.get("approved_at") ?? "").trim();
  if (!isDate(agm)) agm = todayInput(s.community.timezone);
  const { error } = await supabase.from("budgets").update({ status: "approved", approved_at: agm }).eq("community_id", c).eq("id", budget.id);
  done(slug, budget.year, error ? "&error=approve" : "&saved=approved");
}
