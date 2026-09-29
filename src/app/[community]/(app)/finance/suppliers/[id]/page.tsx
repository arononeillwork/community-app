import { notFound } from "next/navigation";
import { ExternalLink, Mail, Pencil, Phone } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { money, todayInput } from "@/lib/format";
import { Button, Card, Notice, PageHeader, Stat, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import ActionButton from "@/components/finance/register/ActionButton";
import { UUID } from "@/components/finance/register/form";
import { addDays, annualCents, noticeStatus } from "@/components/finance/register/dates";
import { setSupplierActive } from "../actions";

export const metadata = { title: "Supplier" };

type SupplierRow = {
  id: string; name: string; service_type: string; tax_id: string | null; contact_name: string | null; email: string | null;
  phone: string | null; website: string | null; address: string | null; iban: string | null; notes: string | null; active: boolean;
};
type ContractRow = {
  id: string; title: string; status: string; start_date: string; end_date: string | null; notice_period_days: number;
  billing_frequency: string; amount_cents: number; category: { name: string } | null;
};
type InvoiceRow = {
  id: string; invoice_number: string; issue_date: string; category_name: string | null; contract_title: string | null;
  total_cents: number; status: string;
};
type ReportRow = { id: string; title: string; kind: string; status: string; priority: string; created_at: string };

export default async function SupplierDetail({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { community, id } = await params;
  const { saved } = await searchParams;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cur = s.community.currency;
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const [{ data }, { data: spend }, { data: contractData }, { data: invoiceData }, { data: reportData }] = await Promise.all([
    supabase.from("suppliers")
      .select("id, name, service_type, tax_id, contact_name, email, phone, website, address, iban, notes, active")
      .eq("id", id).eq("community_id", cid).maybeSingle(),
    supabase.from("v_supplier_spend").select("spend_this_year_cents, spend_all_time_cents").eq("id", id).maybeSingle(),
    supabase.from("contracts")
      .select("id, title, status, start_date, end_date, notice_period_days, billing_frequency, amount_cents, category:expense_categories(name)")
      .eq("community_id", cid).eq("supplier_id", id).order("start_date", { ascending: false }),
    supabase.from("v_invoice_list")
      .select("id, invoice_number, issue_date, category_name, contract_title, total_cents, status")
      .eq("community_id", cid).eq("supplier_id", id).order("issue_date", { ascending: false }),
    // RLS: administrators see every report; other people only see reports they made themselves.
    supabase.from("complaints")
      .select("id, title, kind, status, priority, created_at")
      .eq("community_id", cid).eq("target_supplier_id", id).order("created_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const sup = data as unknown as SupplierRow;
  const totals = spend as { spend_this_year_cents: number; spend_all_time_cents: number } | null;

  const contracts = ((contractData ?? []) as unknown as ContractRow[]).map((c) => {
    const deadline = c.end_date ? addDays(c.end_date, -c.notice_period_days) : null;
    return {
      id: c.id, title: c.title, category: c.category?.name ?? "No category", start_date: c.start_date, end_date: c.end_date ?? undefined,
      notice_deadline: deadline ?? undefined, notice: noticeStatus(c.status, c.end_date, deadline, today),
      annual_cost_cents: annualCents(Number(c.amount_cents), c.billing_frequency), status: c.status,
    };
  });
  const invoices = ((invoiceData ?? []) as unknown as InvoiceRow[]).map((i) => ({
    id: i.id, invoice_number: i.invoice_number, issue_date: i.issue_date, category: i.category_name ?? "No category",
    contract: i.contract_title ?? "No contract", total_cents: Number(i.total_cents), status: i.status,
  }));
  const reports = ((reportData ?? []) as unknown as ReportRow[]).map((r) => ({ ...r }));
  const activeContracts = contracts.filter((c) => c.status === "active").length;

  const contractColumns: Column[] = [
    { key: "title", header: "Contract", href: `${base}/finance/contracts/{id}`, primary: true },
    { key: "category", header: "Category", mobileHidden: true },
    { key: "start_date", header: "Start", type: "date", mobileHidden: true },
    { key: "end_date", header: "End", type: "date" },
    { key: "notice_deadline", header: "Notice deadline", type: "date" },
    { key: "notice", header: "Notice", type: "status" },
    { key: "annual_cost_cents", header: "Annual cost (excl. VAT)", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];
  const invoiceColumns: Column[] = [
    { key: "invoice_number", header: "Invoice", href: `${base}/finance/invoices/{id}`, primary: true },
    { key: "issue_date", header: "Date", type: "date" },
    { key: "category", header: "Category", filter: true, mobileHidden: true },
    { key: "contract", header: "Contract", mobileHidden: true },
    { key: "total_cents", header: "Total", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];
  const reportColumns: Column[] = [
    { key: "title", header: "Report", href: `${base}/report/{id}`, primary: true },
    { key: "kind", header: "Type", type: "status" },
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "priority", header: "Priority", type: "status" },
    { key: "created_at", header: "Reported", type: "date" },
  ];

  const website = sup.website && /^https?:\/\//i.test(sup.website) ? sup.website : sup.website ? `https://${sup.website}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageHeader
          title={sup.name}
          intro={<>{sup.service_type} · <StatusBadge value={sup.active ? "active" : "inactive"} /></>}
          back={{ href: `${base}/finance/suppliers`, label: "Suppliers" }}
          actions={<Button href={`${base}/finance/suppliers/${sup.id}/edit`} size="lg"><Pencil aria-hidden className="size-5" /> Edit supplier</Button>}
        />
        <FinanceNav slug={s.community.slug} />
      </div>

      {saved && <Notice tone="ok">The supplier has been saved.</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Active contracts" value={activeContracts} />
        <Stat label="Spent this year" value={money(Number(totals?.spend_this_year_cents ?? 0), cur)} sub="Invoices including VAT" />
        <Stat label="Spent in total" value={money(Number(totals?.spend_all_time_cents ?? 0), cur)} sub="All years" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl font-bold">Contact</h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Contact person</dt><dd>{sup.contact_name || "–"}</dd>
            <dt className="font-bold">Phone</dt>
            <dd>{sup.phone ? <a href={`tel:${sup.phone.replace(/\s/g, "")}`} className="inline-flex min-h-12 items-center gap-2 font-bold text-brand underline"><Phone aria-hidden className="size-5" />{sup.phone}</a> : "–"}</dd>
            <dt className="font-bold">Email</dt>
            <dd>{sup.email ? <a href={`mailto:${sup.email}`} className="inline-flex min-h-12 items-center gap-2 break-all font-bold text-brand underline"><Mail aria-hidden className="size-5" />{sup.email}</a> : "–"}</dd>
            <dt className="font-bold">Website</dt>
            <dd>{website ? (
              <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 break-all font-bold text-brand underline">
                {sup.website}<ExternalLink aria-hidden className="size-4" /><span className="sr-only">(opens in a new tab)</span>
              </a>) : "–"}</dd>
            <dt className="font-bold">Address</dt><dd className="whitespace-pre-line">{sup.address || "–"}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-1 text-xl font-bold">Tax and bank details</h2>
          <p className="mb-3 text-muted">Only the administrator and the treasurer can see this.</p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Tax ID (CIF / NIF)</dt><dd className="tabular">{sup.tax_id || "–"}</dd>
            <dt className="font-bold">Bank account (IBAN)</dt><dd className="tabular break-all">{sup.iban || "–"}</dd>
          </dl>
          {sup.notes?.trim() && (
            <>
              <h3 className="mb-1 mt-4 text-lg font-bold">Notes</h3>
              <p className="whitespace-pre-line">{sup.notes}</p>
            </>
          )}
        </Card>
      </div>

      <section aria-labelledby="contracts-heading" className="flex flex-col gap-3">
        <h2 id="contracts-heading" className="text-2xl font-bold">Contracts</h2>
        <DataTable id="c_" rows={contracts} columns={contractColumns} currency={cur} defaultSort={{ key: "start_date", desc: true }}
          exportName="supplier-contracts" searchPlaceholder="Search contracts…" empty="No contracts with this supplier." />
      </section>

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-3">
        <h2 id="invoices-heading" className="text-2xl font-bold">Invoices</h2>
        <DataTable id="i_" rows={invoices} columns={invoiceColumns} currency={cur} dateKey="issue_date"
          defaultSort={{ key: "issue_date", desc: true }} exportName="supplier-invoices" searchPlaceholder="Search invoices…"
          empty="No invoices from this supplier yet." />
      </section>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
        <h2 id="reports-heading" className="text-2xl font-bold">Reports from residents about this supplier</h2>
        {s.isAdmin ? (
          <DataTable id="r_" rows={reports} columns={reportColumns} defaultSort={{ key: "created_at", desc: true }}
            exportName="supplier-reports" searchPlaceholder="Search reports…" empty="No reports about this supplier." />
        ) : reports.length === 0 ? (
          <Card><p>Reports are visible to administrators.</p></Card>
        ) : (
          <>
            <p className="text-muted">You can only see reports you made yourself. Reports are visible to administrators.</p>
            <DataTable id="r_" rows={reports} columns={reportColumns} defaultSort={{ key: "created_at", desc: true }}
              exportName="supplier-reports" searchPlaceholder="Search reports…" />
          </>
        )}
      </section>

      <Card className="no-print">
        <h2 className="mb-2 text-xl font-bold">Supplier status</h2>
        <p className="mb-3">
          {sup.active
            ? <>This supplier is <strong>active</strong>. If the community no longer works with them, mark them as inactive. They stay in the records with all their invoices.</>
            : <>This supplier is <strong>inactive</strong>. They are not offered when adding new contracts.</>}
        </p>
        {/* One button in one place, so the "saved" message stays visible after the change. */}
        <ActionButton action={setSupplierActive.bind(null, s.community.slug, sup.id, !sup.active)}
          variant={sup.active ? "secondary" : "primary"} pendingLabel="Saving…">
          {sup.active ? "Mark as inactive" : "Mark as active again"}
        </ActionButton>
      </Card>
    </div>
  );
}
