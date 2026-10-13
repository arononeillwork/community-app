import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput, date, money, todayInput } from "@/lib/format";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { addDays, addMonths, monthsBetween } from "@/components/finance-ops/dates";
import ContractForm, { type ContractInitial } from "../ContractForm";

export const metadata = { title: "New contract" };

export default async function NewContractPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ from?: string; quote?: string }>;
}) {
  const { community } = await params;
  const { from, quote } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/contracts`;
  const today = todayInput(s.community.timezone);

  const [{ data: suppliers }, { data: categories }, renewRes, quoteRes] = await Promise.all([
    supabase.from("suppliers").select("id, name, service_type").eq("community_id", c).eq("active", true).order("name"),
    supabase.from("expense_categories").select("id, name").eq("community_id", c).order("sort"),
    from ? supabase.from("contracts").select("*").eq("community_id", c).eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
    quote ? supabase.from("quotes").select("*").eq("community_id", c).eq("id", quote).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let initial: ContractInitial = {
    supplier_id: "", new_supplier_name: "", new_supplier_service: "", title: "", category_id: "",
    start_date: today, end_date: "", notice_period_days: "30", auto_renew: false, billing_frequency: "monthly",
    amount: "", vat_rate: "21", price_review_clause: "", notes: "",
  };
  let title = "New contract";
  let description: string | undefined = "Add a supplier contract to track its notice deadline and yearly cost.";
  let back = { href: base, label: "Contracts" };

  const old = renewRes.data;
  const q = quoteRes.data;
  if (old) {
    // Renewal: same terms, starting the day after the old contract ends, for the same length.
    const start = old.end_date ? addDays(old.end_date, 1) : today;
    const months = old.end_date ? Math.max(1, monthsBetween(old.start_date, addDays(old.end_date, 1))) : null;
    initial = {
      ...initial,
      supplier_id: old.supplier_id, title: old.title, category_id: old.category_id ?? "",
      start_date: start, end_date: months ? addDays(addMonths(start, months), -1) : "",
      notice_period_days: String(old.notice_period_days), auto_renew: old.auto_renew, billing_frequency: old.billing_frequency,
      amount: centsToInput(old.amount_cents), vat_rate: String(Number(old.vat_rate)), price_review_clause: old.price_review_clause ?? "",
      notes: `Renewal of the contract from ${date(old.start_date)}${old.end_date ? ` to ${date(old.end_date)}` : ""}.`,
    };
    title = "Renew contract";
    description = "The terms are copied from the current contract. Check the dates and price.";
    back = { href: `${base}/${old.id}`, label: old.title };
  } else if (q) {
    // From a chosen quote: supplier, job and price. Quotes are total prices, so check the billing period.
    const known = (suppliers ?? []).find((x) => x.id === q.supplier_id) ?? (suppliers ?? []).find((x) => x.name.toLowerCase() === String(q.supplier_name ?? "").toLowerCase());
    // A quote is one total. Treat it as a yearly price when it reads like a running service, else as a one-off job.
    const recurring = /\b(per|a|each) (year|month)\b|\byearly\b|\bannual|\bmonthly\b/i.test(`${q.job_title} ${q.notes ?? ""}`);
    initial = {
      ...initial,
      supplier_id: known?.id ?? "new",
      new_supplier_name: known ? "" : q.supplier_name ?? "",
      title: q.job_title,
      billing_frequency: recurring ? "yearly" : "one_off",
      notice_period_days: recurring ? initial.notice_period_days : "0",
      amount: centsToInput(q.amount_cents),
      notes: `Based on the quote from ${known?.name ?? q.supplier_name ?? "the supplier"} for ${money(q.amount_cents, s.community.currency)}${q.valid_until ? `, valid until ${date(q.valid_until)}` : ""}.${q.notes ? ` ${q.notes.trim()}${/[.!?]$/.test(q.notes.trim()) ? "" : "."}` : ""}`,
    };
    title = "Contract from quote";
    description = `Prefilled from the chosen quote as ${recurring ? "a yearly" : "a one-off"} price. Check the billing period, VAT and dates.`;
    back = { href: `/${s.community.slug}/finance/quotes`, label: "Quotes" };
  }

  return (
    <div className="max-w-3xl">
      <FinanceHeader title={title} intro={description} back={back} />
      <ContractForm
        slug={s.community.slug}
        contractId={null}
        initial={initial}
        suppliers={suppliers ?? []}
        categories={categories ?? []}
        currentFile={null}
        cancelHref={back.href}
        submitLabel="Add contract"
        quoteId={!old && q ? q.id : undefined}
      />
    </div>
  );
}
