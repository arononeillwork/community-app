import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lookups } from "./audit";
import { getPeopleNames } from "./people";

/** Id → name maps used to show audit records in words. Read with the signed-in user's client (RLS applies). */
export async function loadLookups(supabase: SupabaseClient, communityId: string): Promise<Lookups> {
  const c = communityId;
  const [people, suppliers, categories, contracts, invoices, units, budgets, levies] = await Promise.all([
    getPeopleNames(supabase, c),
    supabase.from("suppliers").select("id, name").eq("community_id", c),
    supabase.from("expense_categories").select("id, name").eq("community_id", c),
    supabase.from("contracts").select("id, title").eq("community_id", c),
    supabase.from("invoices").select("id, invoice_number").eq("community_id", c),
    supabase.from("units").select("id, label").eq("community_id", c),
    supabase.from("budgets").select("id, name").eq("community_id", c),
    supabase.from("levies").select("id, title").eq("community_id", c),
  ]);
  const map = <T extends Record<string, unknown>>(rows: T[] | null, k: keyof T) =>
    new Map((rows ?? []).map((r) => [String(r.id), String(r[k] ?? "")]));
  return {
    people,
    suppliers: map(suppliers.data, "name"),
    categories: map(categories.data, "name"),
    contracts: map(contracts.data, "title"),
    invoices: map(invoices.data, "invoice_number"),
    units: map(units.data, "label"),
    budgets: map(budgets.data, "name"),
    levies: map(levies.data, "title"),
  };
}
