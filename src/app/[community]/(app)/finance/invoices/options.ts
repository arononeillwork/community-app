import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Suppliers, categories and active contracts for the invoice form (read with the user's client). */
export async function loadInvoiceFormOptions(supabase: SupabaseClient, communityId: string, includeSupplier?: string) {
  const [{ data: suppliers }, { data: categories }, { data: contracts }] = await Promise.all([
    supabase.from("suppliers").select("id, name, service_type, active").eq("community_id", communityId).order("name"),
    supabase.from("expense_categories").select("id, name").eq("community_id", communityId).order("sort").order("name"),
    supabase.from("contracts").select("id, supplier_id, title, category_id, vat_rate, status").eq("community_id", communityId).order("title"),
  ]);
  return {
    // Inactive suppliers are hidden, except the one an existing invoice already uses.
    suppliers: (suppliers ?? []).filter((x) => x.active || x.id === includeSupplier)
      .map((x) => ({ id: x.id as string, name: x.name as string, service_type: x.service_type as string })),
    categories: (categories ?? []).map((x) => ({ id: x.id as string, name: x.name as string })),
    contracts: (contracts ?? []).map((x) => ({
      id: x.id as string, supplier_id: x.supplier_id as string, title: `${x.title}${x.status !== "active" ? " (ended)" : ""}`,
      category_id: x.category_id as string | null, vat_rate: Number(x.vat_rate),
    })),
  };
}
