import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Pencil } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Button, Card, Notice, PageHeader, Stat, StatusBadge } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import ContractTimeline from "@/components/finance/register/ContractTimeline";
import { UUID } from "@/components/finance/register/form";
import {
  addDays, annualCents, daysBetween, frequencyPer, noticeStatus, relativeDays, withVat,
} from "@/components/finance/register/dates";

export const metadata = { title: "Contract" };

type ContractRow = {
  id: string; title: string; status: string; start_date: string; end_date: string | null; notice_period_days: number;
  auto_renew: boolean; billing_frequency: string; amount_cents: number; vat_rate: number | string;
  price_review_clause: string | null; file_path: string | null; notes: string | null; supplier_id: string;
  supplier: { id: string; name: string; phone: string | null; email: string | null } | null;
  category: { name: string } | null;
};

type InvoiceRow = {
  id: string; invoice_number: string; issue_date: string; due_date: string | null; net_cents: number; vat_cents: number;
  total_cents: number; status: string;
};

export default async function ContractDetail({ params, searchParams }: {
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
  const today = todayInput(s.community.timezone);

  const [{ data }, { data: kd }, { data: inv }] = await Promise.all([
    supabase.from("contracts")
      .select("id, title, status, start_date, end_date, notice_period_days, auto_renew, billing_frequency, amount_cents, vat_rate, price_review_clause, file_path, notes, supplier_id, supplier:suppliers(id, name, phone, email), category:expense_categories(name)")
      .eq("id", id).eq("community_id", s.community.id).maybeSingle(),
    supabase.from("v_contract_key_dates").select("notice_deadline, length_months").eq("id", id).maybeSingle(),
    supabase.from("v_invoice_list")
      .select("id, invoice_number, issue_date, due_date, net_cents, vat_cents, total_cents, status")
      .eq("community_id", s.community.id).eq("contract_id", id).order("issue_date", { ascending: false }),
  ]);
  if (!data) notFound();
  const c = data as unknown as ContractRow;
  const keyDates = kd as { notice_deadline: string | null; length_months: number | null } | null;

  const deadline = keyDates?.notice_deadline ?? (c.end_date ? addDays(c.end_date, -c.notice_period_days) : null);
  const status = noticeStatus(c.status, c.end_date, deadline, today);
  const ended = c.status !== "active";
  const toDeadline = daysBetween(today, deadline);
  const vatRate = Number(c.vat_rate);
  const amount = Number(c.amount_cents);
  const yearly = annualCents(amount, c.billing_frequency);
  const supplierName = c.supplier?.name ?? "the supplier";

  const fileUrl = c.file_path
    ? (await supabase.storage.from("finance").createSignedUrl(c.file_path, 3600)).data?.signedUrl ?? null
    : null;

  const invoices = ((inv ?? []) as unknown as InvoiceRow[]).map((i) => ({
    id: i.id, invoice_number: i.invoice_number, issue_date: i.issue_date, due_date: i.due_date,
    net_cents: Number(i.net_cents), vat_cents: Number(i.vat_cents), total_cents: Number(i.total_cents), status: i.status,
  }));
  const invoicedTotal = invoices.filter((i) => i.status !== "disputed").reduce((sum, i) => sum + i.total_cents, 0);

  const invoiceColumns: Column[] = [
    { key: "invoice_number", header: "Invoice", href: `${base}/finance/invoices/{id}`, primary: true },
    { key: "issue_date", header: "Date", type: "date" },
    { key: "due_date", header: "Due", type: "date", mobileHidden: true },
    { key: "net_cents", header: "Before VAT", type: "money", total: true, mobileHidden: true },
    { key: "vat_cents", header: "VAT", type: "money", total: true, mobileHidden: true },
    { key: "total_cents", header: "Total", type: "money", total: true },
    { key: "status", header: "Status", type: "status", filter: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageHeader
          title={c.title}
          intro={<>Contract with {c.supplier ? <Link href={`${base}/finance/suppliers/${c.supplier.id}`} className="font-bold text-brand underline">{c.supplier.name}</Link> : "a supplier"}{c.category ? ` · ${c.category.name}` : ""}</>}
          back={{ href: `${base}/finance/contracts`, label: "Contracts" }}
          actions={<Button href={`${base}/finance/contracts/${c.id}/edit`} size="lg"><Pencil aria-hidden className="size-5" /> Edit contract</Button>}
        />
        <FinanceNav slug={s.community.slug} />
      </div>

      {saved && <Notice tone="ok">The contract has been saved.</Notice>}

      {status === "overdue" && (
        <Notice tone="bad">
          The notice deadline was {date(deadline)} ({-(toDeadline ?? 0)} days ago).
          {c.auto_renew ? " This contract renews automatically, so it may already have started again." : " Check with the company what happens next."}
          {" "}If the contract has finished, edit it and set the status to Ended.
        </Notice>
      )}
      {status === "due_soon" && (
        <Notice tone="warn">
          Notice deadline {relativeDays(toDeadline)} ({date(deadline)}). If you want to end or renegotiate this contract, tell {supplierName} before then.
        </Notice>
      )}
      {status === "ok" && <Notice tone="ok">Notice deadline {relativeDays(toDeadline)} ({date(deadline)}). Nothing to do yet.</Notice>}
      {status === "rolling" && (
        <Notice tone="info">This is a rolling contract with no end date. To end it, give {c.notice_period_days} days&apos; notice.</Notice>
      )}
      {ended && <Notice tone="neutral">This contract is {c.status === "cancelled" ? "cancelled" : "ended"}. It is kept for the records.</Notice>}

      <Card>
        <h2 className="mb-4 text-xl font-bold">Key dates</h2>
        <ContractTimeline start={c.start_date} end={c.end_date} deadline={deadline} today={today}
          noticeDays={c.notice_period_days} ended={ended} />
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cost per year" value={money(yearly, cur)} sub="Without VAT" />
        <Stat label="With VAT" value={money(withVat(yearly, vatRate), cur)} sub={`VAT at ${vatRate} %`} />
        <Stat label="Invoiced so far" value={money(invoicedTotal, cur)} sub={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} (not counting disputed)`} />
        <Stat label="Notice period" value={`${c.notice_period_days} days`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl font-bold">Details</h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Status</dt><dd><StatusBadge value={c.status} /></dd>
            <dt className="font-bold">Supplier</dt>
            <dd>
              {c.supplier ? <Link href={`${base}/finance/suppliers/${c.supplier.id}`} className="font-bold text-brand underline">{c.supplier.name}</Link> : "–"}
              {c.supplier?.phone && <div><a href={`tel:${c.supplier.phone.replace(/\s/g, "")}`} className="text-brand underline">{c.supplier.phone}</a></div>}
            </dd>
            <dt className="font-bold">Category</dt><dd>{c.category?.name ?? "No category"}</dd>
            <dt className="font-bold">Amount</dt>
            <dd className="tabular">{money(amount, cur)} {frequencyPer(c.billing_frequency)} without VAT ({money(withVat(amount, vatRate), cur)} with VAT)</dd>
            <dt className="font-bold">Auto-renew</dt>
            <dd>{c.auto_renew ? "Yes – it starts again unless notice is given in time" : "No – it stops at the end date"}</dd>
            <dt className="font-bold">Start</dt><dd>{date(c.start_date)}</dd>
            <dt className="font-bold">End</dt><dd>{c.end_date ? date(c.end_date) : "No end date (rolling)"}</dd>
            {keyDates?.length_months != null && (<><dt className="font-bold">Length</dt><dd>{keyDates.length_months} months</dd></>)}
            <dt className="font-bold">Notice deadline</dt><dd>{deadline ? date(deadline) : "–"}</dd>
          </dl>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-2 text-xl font-bold">Price review clause</h2>
            <p className="mb-3 text-muted">When and how the price is allowed to go up.</p>
            {c.price_review_clause?.trim()
              ? <p className="whitespace-pre-line rounded-xl bg-bg p-4">{c.price_review_clause}</p>
              : <p>No price review clause has been written down. You can add it with “Edit contract”.</p>}
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Contract file</h2>
            {fileUrl ? (
              <Button href={fileUrl} external variant="secondary">
                <FileText aria-hidden className="size-5" /> Open the contract file <ExternalLink aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </Button>
            ) : c.file_path ? (
              <p>The file could not be opened right now. Please try again later.</p>
            ) : (
              <p>No file uploaded yet. You can add the signed contract with “Edit contract”.</p>
            )}
          </Card>

          {c.notes?.trim() && (
            <Card>
              <h2 className="mb-2 text-xl font-bold">Notes</h2>
              <p className="whitespace-pre-line">{c.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-3">
        <h2 id="invoices-heading" className="text-2xl font-bold">Invoices for this contract</h2>
        <DataTable
          id="inv_"
          rows={invoices}
          columns={invoiceColumns}
          dateKey="issue_date"
          currency={cur}
          defaultSort={{ key: "issue_date", desc: true }}
          exportName={`contract-invoices`}
          searchPlaceholder="Search invoices…"
          empty="No invoices are linked to this contract yet."
        />
      </section>
    </div>
  );
}
