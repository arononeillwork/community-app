import { notFound, redirect } from "next/navigation";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput } from "@/lib/format";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import { attachmentName, guessVatRate } from "@/components/finance/invoice";
import InvoiceForm from "../../InvoiceForm";
import { updateInvoice } from "../../actions";
import { loadInvoiceFormOptions } from "../../options";

export const metadata = { title: "Edit invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditInvoicePage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}/finance/invoices`;

  const { data: inv } = await supabase.from("invoices")
    .select("id, supplier_id, category_id, contract_id, invoice_number, issue_date, due_date, net_cents, vat_cents, notes, file_path, status")
    .eq("community_id", s.community.id).eq("id", id).maybeSingle();
  if (!inv) notFound();
  // Only invoices still waiting for approval can be changed; the rest are part of the record.
  if (inv.status !== "received") redirect(`${base}/${id}`);

  const [options, { count: approvals }, signed] = await Promise.all([
    loadInvoiceFormOptions(supabase, s.community.id, inv.supplier_id),
    supabase.from("invoice_approvals").select("id", { count: "exact", head: true }).eq("invoice_id", id),
    inv.file_path ? supabase.storage.from("finance").createSignedUrl(inv.file_path, 3600) : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <FinanceToolbar title={`Edit invoice ${inv.invoice_number}`} meta="Only possible while it is waiting for approval."
        back={{ href: `${base}/${id}`, label: "Invoice" }} />
      <InvoiceForm
        action={updateInvoice.bind(null, s.community.slug, id)}
        slug={s.community.slug}
        {...options}
        initial={{
          supplier_id: inv.supplier_id, category_id: inv.category_id ?? "", contract_id: inv.contract_id ?? "",
          invoice_number: inv.invoice_number, issue_date: inv.issue_date, due_date: inv.due_date ?? "",
          net: centsToInput(inv.net_cents), vat_rate: String(guessVatRate(Number(inv.net_cents), Number(inv.vat_cents))), notes: inv.notes ?? "",
        }}
        currency={s.community.currency}
        thresholdCents={s.community.settings?.invoice_approval_threshold_cents}
        cancelHref={`${base}/${id}`}
        submitLabel="Save changes"
        attachment={inv.file_path ? { name: attachmentName(inv.file_path), url: signed.data?.signedUrl ?? null } : null}
        approvals={approvals ?? 0}
      />
    </div>
  );
}
