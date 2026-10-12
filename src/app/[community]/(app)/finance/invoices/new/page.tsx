import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import InvoiceForm from "../InvoiceForm";
import { createInvoice } from "../actions";
import { loadInvoiceFormOptions } from "../options";

export const metadata = { title: "Add invoice" };

export default async function NewInvoicePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { community } = await params;
  const { supplier } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance`;
  const options = await loadInvoiceFormOptions(supabase, s.community.id);
  const preselect = options.suppliers.some((x) => x.id === supplier) ? supplier! : "";
  const today = todayInput(s.community.timezone);

  return (
    <div className="mx-auto max-w-3xl">
      <FinanceToolbar title="Add an invoice" meta="Enter it as printed. It is then approved before it is paid."
        back={preselect ? { href: `${base}/suppliers/${preselect}`, label: "Supplier" } : { href: `${base}/invoices`, label: "Invoices" }} />
      <InvoiceForm
        action={createInvoice.bind(null, s.community.slug)}
        slug={s.community.slug}
        {...options}
        initial={{ supplier_id: preselect, issue_date: today, vat_rate: "21" }}
        currency={s.community.currency}
        thresholdCents={s.community.settings?.invoice_approval_threshold_cents}
        cancelHref={preselect ? `${base}/suppliers/${preselect}` : `${base}/invoices`}
        submitLabel="Save invoice"
      />
    </div>
  );
}
