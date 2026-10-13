import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, FileSignature, MessageSquareWarning, Pencil, Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, moneyShort, todayInput } from "@/lib/format";
import { Badge, Button, Card, DefinitionList, Notice, SectionHeader, StatusBadge } from "@/components/ui";
import { ContactActions, PhoneText } from "@/components/contact";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { fetchAll } from "@/components/finance/fetch-all";
import { dayOf } from "@/components/finance/dates";
import IbanReveal from "./IbanReveal";
import { revealIban } from "../actions";

export const metadata = { title: "Supplier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAVED: Record<string, string> = {
  added: "Supplier added. You can now record their invoices.",
  updated: "Changes saved.",
};

type Report = { id: string; kind: string; title: string; status: string; priority: string; created_at: string; resolved_at: string | null };

export default async function SupplierPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { community, id } = await params;
  const { saved } = await searchParams;
  const s = await requireFinance(community);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance`;
  const cur = s.community.currency;

  // The full IBAN is never loaded here: the page gets the masked form and "Show" asks the server for the rest.
  const { data: sup } = await supabase.from("suppliers")
    .select("id, name, service_type, tax_id, contact_name, email, phone, website, address, notes, active, iban_masked")
    .eq("community_id", c).eq("id", id).maybeSingle();
  if (!sup) notFound();

  const [{ data: supplierContracts }, invoices, { data: reports }] = await Promise.all([
    supabase.from("contracts")
      .select("id, title, end_date, billing_frequency, amount_cents, status")
      .eq("community_id", c).eq("supplier_id", id).order("end_date", { ascending: true, nullsFirst: false }),
    fetchAll<{ id: string; invoice_number: string; issue_date: string; total_cents: number; status: string }>((from, to) =>
      supabase.from("invoices").select("id, invoice_number, issue_date, total_cents, status")
        .eq("community_id", c).eq("supplier_id", id).order("issue_date", { ascending: false }).order("id").range(from, to)),
    supabase.rpc("supplier_reports", { p_supplier: id }),
  ]);

  const today = todayInput(s.community.timezone);
  const year = Number(today.slice(0, 4));
  const counted = invoices.filter((i) => i.status !== "disputed");
  const sumYear = (y: number) => counted.filter((i) => i.issue_date.startsWith(`${y}-`)).reduce((t, i) => t + Number(i.total_cents), 0);
  const thisYear = sumYear(year);
  const lastYear = sumYear(year - 1);
  const sameTimeLastYear = counted.filter((i) => i.issue_date >= `${year - 1}-01-01` && i.issue_date <= `${year - 1}${today.slice(4)}`)
    .reduce((t, i) => t + Number(i.total_cents), 0);
  const change = sameTimeLastYear > 0 ? Math.round(((thisYear - sameTimeLastYear) / sameTimeLastYear) * 100) : null;
  const allTime = counted.reduce((t, i) => t + Number(i.total_cents), 0);
  const unpaid = invoices.filter((i) => i.status === "received" || i.status === "approved");

  const current = (supplierContracts ?? []).filter((k) => k.status === "active");
  const past = (supplierContracts ?? []).filter((k) => k.status !== "active");
  const recent = invoices.slice(0, 6);
  const rep = (reports ?? []) as Report[];
  const openReports = rep.filter((r) => !["resolved", "closed"].includes(r.status)).length;
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
  const lastYearReports = rep.filter((r) => r.created_at >= yearAgo).length;

  return (
    <>
      <FinanceHeader
        back={{ href: `${base}/suppliers`, label: "Suppliers" }}
        title={sup.name}
        badge={!sup.active ? <Badge tone="neutral">No longer used</Badge> : undefined}
        intro={sup.service_type}
        actions={<>
          <Button href={`${base}/suppliers/${id}/edit`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit</Button>
          <Button href={`${base}/invoices/new?supplier=${id}`}><Plus aria-hidden className="size-4" /> Add invoice</Button>
        </>}
      />
      <div className="flex flex-col gap-5">
        {saved && SAVED[saved] && <Notice tone="ok">{SAVED[saved]}</Notice>}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="flex flex-col gap-5 lg:col-span-2">
            <SectionHeader icon={Building2} title="Details" className="!mb-0" />
            <ContactActions variant="buttons" name={sup.contact_name ?? sup.name} phone={sup.phone} email={sup.email} />
            <DefinitionList items={[
              { label: "Contact person", value: sup.contact_name || <span className="text-muted">Not recorded</span> },
              { label: "Phone", value: sup.phone ? <PhoneText phone={sup.phone} /> : <span className="text-muted">Not recorded</span> },
              { label: "Email", value: sup.email ? <a href={`mailto:${sup.email}`} className="break-all">{sup.email}</a> : <span className="text-muted">Not recorded</span> },
              ...(sup.website ? [{ label: "Website", value: <a href={sup.website} target="_blank" rel="noopener noreferrer" className="break-all">{sup.website}</a> }] : []),
              ...(sup.address ? [{ label: "Address", value: sup.address }] : []),
              { label: "Tax ID", value: sup.tax_id ? <span className="tabular">{sup.tax_id}</span> : <span className="text-muted">Not recorded</span> },
              {
                label: "IBAN",
                value: sup.iban_masked ? <IbanReveal masked={sup.iban_masked} reveal={revealIban.bind(null, s.community.slug, id)} />
                  : <span className="text-muted">Not recorded. <Link href={`${base}/suppliers/${id}/edit`}>Add it</Link> before paying them.</span>,
              },
              ...(sup.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{sup.notes}</span> }] : []),
            ]} />
          </Card>

          <Card className="flex flex-col gap-4 self-start">
            <SectionHeader icon={Receipt} title="Spending" className="!mb-0" description="Invoices, not counting disputed ones" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2 p-3.5">
                <div className="text-sm text-muted">{year} so far</div>
                <div className="mt-1 text-[1.25rem] font-semibold leading-tight" title={money(thisYear, cur)}>{moneyShort(thisYear, cur)}</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3.5">
                <div className="text-sm text-muted">{year - 1}</div>
                <div className="mt-1 text-[1.25rem] font-semibold leading-tight" title={money(lastYear, cur)}>{moneyShort(lastYear, cur)}</div>
              </div>
            </div>
            {change != null && (
              <p className="flex items-center gap-2 text-[0.9375rem] text-ink-2">
                {change >= 0 ? <TrendingUp aria-hidden className="size-4 text-muted" /> : <TrendingDown aria-hidden className="size-4 text-muted" />}
                {change === 0 ? "Same as" : `${Math.abs(change)}% ${change > 0 ? "more than" : "less than"}`} by this time last year
              </p>
            )}
            <dl className="divide-y divide-line text-[0.9375rem]">
              <div className="flex justify-between gap-3 pb-2.5">
                <dt className="text-muted">All time</dt>
                <dd className="tabular text-ink">{money(allTime, cur)}</dd>
              </div>
              <div className="flex justify-between gap-3 pt-2.5">
                <dt className="text-muted">Unpaid now</dt>
                <dd className="text-right tabular text-ink">
                  {unpaid.length ? <>{money(unpaid.reduce((t, i) => t + Number(i.total_cents), 0), cur)}<span className="block text-sm text-muted">{unpaid.length} {unpaid.length === 1 ? "invoice" : "invoices"}</span></> : "Nothing"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <Card padded={false}>
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={FileSignature} title="Contracts"
                description={current.length ? `${current.length} active` : undefined} />
            </div>
            {current.length + past.length ? (
              <ul className="divide-y divide-line pb-2">
                {[...current, ...past].map((k) => (
                  <li key={k.id}>
                    <Link href={`${base}/contracts/${k.id}`} className="group flex items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-surface-2 sm:px-6">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:underline">{k.title}</span>
                        <span className="block text-sm text-muted">
                          {money(k.amount_cents, cur)} {k.billing_frequency === "one_off" ? "one-off" : `per ${k.billing_frequency === "monthly" ? "month" : k.billing_frequency === "quarterly" ? "quarter" : "year"}`}
                          {k.end_date ? ` · ends ${date(k.end_date)}` : " · rolling"}
                        </span>
                      </span>
                      <StatusBadge value={k.status} />
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-6 text-[0.9375rem] text-muted sm:px-6">No contracts with this supplier. Work is invoiced job by job.</p>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Receipt} title="Recent invoices"
                action={invoices.length > recent.length
                  ? <Button href={`${base}/invoices?f_supplier_name=${encodeURIComponent(sup.name)}`} variant="ghost" size="sm">All {invoices.length}</Button>
                  : undefined} />
            </div>
            {recent.length ? (
              <ul className="divide-y divide-line pb-2">
                {recent.map((i) => (
                  <li key={i.id}>
                    <Link href={`${base}/invoices/${i.id}`} className="group flex items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-surface-2 sm:px-6">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:underline">{i.invoice_number}</span>
                        <span className="block text-sm text-muted">{date(i.issue_date)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[0.9375rem] tabular text-ink-2">{money(i.total_cents, cur)}</span>
                        <StatusBadge value={i.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 pb-6 sm:px-6">
                <p className="text-[0.9375rem] text-muted">No invoices yet.</p>
                <div className="mt-3"><Button href={`${base}/invoices/new?supplier=${id}`} variant="secondary" size="sm">Add their first invoice</Button></div>
              </div>
            )}
          </Card>
        </div>

        <Card padded={false}>
          <div className="p-5 pb-1 sm:p-6 sm:pb-1">
            <SectionHeader icon={MessageSquareWarning} title="Resident reports"
              description={rep.length ? `${lastYearReports} in the last 12 months · ${openReports} open` : "How residents rate the service"} />
          </div>
          {rep.length ? (
            <ul className="divide-y divide-line pb-2">
              {rep.map((r) => {
                const inner = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block text-sm text-muted">{dayOf(r.created_at, s.community.timezone)}{r.resolved_at ? ` · resolved ${dayOf(r.resolved_at, s.community.timezone)}` : ""}</span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {(r.priority === "high" || r.priority === "urgent") && <StatusBadge value={r.priority} />}
                      <StatusBadge value={r.status} />
                    </span>
                  </>
                );
                return (
                  <li key={r.id}>
                    {s.isAdmin ? (
                      <Link href={`/${s.community.slug}/report/${r.id}`} className="flex items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-surface-2 sm:px-6">{inner}</Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-3 sm:px-6">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 pb-6 text-[0.9375rem] text-muted sm:px-6">No resident has reported a problem with this supplier.</p>
          )}
          {rep.length > 0 && !s.isAdmin && (
            <p className="hint px-5 pb-5 sm:px-6">The administrator handles these reports and can open the details.</p>
          )}
        </Card>
      </div>
    </>
  );
}
