import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink, FileText, History, Pencil, Receipt } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Avatar, Badge, Button, Card, DefinitionList, Notice, SectionHeader, StatusBadge } from "@/components/ui";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { attachmentName, guessVatRate, requiredApprovals } from "@/components/finance/invoice";
import { type AuditRow, shortDateTime, summarise } from "@/components/finance/audit";
import { loadLookups } from "@/components/finance/lookups";
import { personName } from "@/components/finance/people";
import { dayOf, isOverdue } from "@/components/finance/dates";
import InvoiceActions from "./InvoiceActions";
import { approveInvoice, disputeInvoice, markInvoicePaid, reopenInvoice } from "../actions";

export const metadata = { title: "Invoice" };

const SAVED: Record<string, { title: string; text: string }> = {
  added: { title: "Invoice added", text: "It now waits for approval before it can be paid." },
  updated: { title: "Changes saved", text: "The invoice details are up to date." },
  approval: { title: "Approval recorded", text: "It needs one more person to approve it." },
  approved: { title: "Invoice approved", text: "It can now be paid. Mark it as paid once the money has left the bank." },
  paid: { title: "Marked as paid", text: "The payment date is recorded in the history." },
  disputed: { title: "Invoice disputed", text: "It will not be paid until the dispute is reopened." },
  reopened: { title: "Dispute resolved", text: "The invoice is back in the approval flow." },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoicePage({ params, searchParams }: {
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
  const tz = s.community.timezone;

  const { data: inv } = await supabase.from("invoices")
    .select("*, supplier:suppliers(id, name, service_type), category:expense_categories(name), contract:contracts(id, title)")
    .eq("community_id", c).eq("id", id).maybeSingle();
  if (!inv) notFound();

  const [{ data: approvals }, { data: invoiceAudit }, { data: approvalAudit }, lookups] = await Promise.all([
    supabase.from("invoice_approvals").select("approver_id, approved_at").eq("invoice_id", id).order("approved_at"),
    supabase.from("audit_log").select("id, at, table_name, record_id, action, actor, old_data, new_data")
      .eq("community_id", c).eq("table_name", "invoices").eq("record_id", id).order("at", { ascending: false }),
    supabase.from("audit_log").select("id, at, table_name, record_id, action, actor, old_data, new_data")
      .eq("community_id", c).eq("table_name", "invoice_approvals")
      .or(`new_data->>invoice_id.eq.${id},old_data->>invoice_id.eq.${id}`).order("at", { ascending: false }),
    loadLookups(supabase, c),
  ]);
  const signed = inv.file_path ? (await supabase.storage.from("finance").createSignedUrl(inv.file_path, 3600)).data : null;

  const total = Number(inv.total_cents);
  const need = requiredApprovals(total, s.community.settings?.invoice_approval_threshold_cents);
  const given = approvals ?? [];
  const mine = given.some((a) => a.approver_id === s.userId);
  const today = todayInput(tz);
  const overdue = isOverdue(inv.status, inv.due_date, today);
  const daysLate = overdue ? Math.round((Date.parse(today) - Date.parse(inv.due_date)) / 86400000) : 0;
  const rate = guessVatRate(Number(inv.net_cents), Number(inv.vat_cents));
  const history = ([...(invoiceAudit ?? []), ...(approvalAudit ?? [])] as AuditRow[])
    .filter((r) => !(r.table_name === "invoices" && r.action === "update" && JSON.stringify(r.old_data) === JSON.stringify(r.new_data)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
  const savedNote = saved ? SAVED[saved] : null;
  const threshold = money(s.community.settings?.invoice_approval_threshold_cents ?? 100000, cur);

  return (
    <>
      <FinanceHeader
        back={{ href: `${base}/invoices`, label: "Invoices" }}
        title={`Invoice ${inv.invoice_number}`}
        badge={<><StatusBadge value={inv.status} />{overdue && <Badge tone="bad">Overdue</Badge>}</>}
        intro={<><Link href={`${base}/suppliers/${inv.supplier.id}`} className="font-medium">{inv.supplier.name}</Link> · {inv.supplier.service_type}</>}
        actions={inv.status === "received" ? (
          <Button href={`${base}/invoices/${id}/edit`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit details</Button>
        ) : undefined}
      />
      <div className="flex flex-col gap-5">
        {savedNote && <Notice tone="ok" title={savedNote.title}>{savedNote.text}</Notice>}
        {inv.status === "disputed" && (
          <Notice tone="bad" title="Disputed">{inv.dispute_reason || "No reason was recorded."}</Notice>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="flex flex-col gap-5 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-muted">{inv.status === "paid" ? "Total paid" : inv.status === "disputed" ? "Total invoiced" : "Total to pay"}</div>
                <div className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight">{money(total, cur)}</div>
              </div>
              {inv.status === "paid" ? (
                <Badge tone="ok">Paid {date(inv.paid_date)}</Badge>
              ) : inv.due_date ? (
                <Badge tone={overdue ? "bad" : "neutral"}>{overdue ? `${daysLate} ${daysLate === 1 ? "day" : "days"} late` : `Due ${date(inv.due_date)}`}</Badge>
              ) : null}
            </div>
            <DefinitionList items={[
              { label: "Net amount", value: <span className="tabular">{money(inv.net_cents, cur)}</span> },
              { label: `VAT (${rate}%)`, value: <span className="tabular">{money(inv.vat_cents, cur)}</span> },
              { label: "Invoice date", value: date(inv.issue_date) },
              { label: "Due date", value: inv.due_date ? date(inv.due_date) : "No due date" },
              ...(inv.paid_date ? [{ label: "Paid on", value: date(inv.paid_date) }] : []),
              { label: "Category", value: inv.category?.name ?? "Uncategorised" },
              { label: "Contract", value: inv.contract ? <Link href={`${base}/contracts/${inv.contract.id}`}>{inv.contract.title}</Link> : "Not under a contract" },
              ...(inv.notes ? [{ label: "Description", value: <span className="whitespace-pre-line">{inv.notes}</span> }] : []),
              { label: "Added by", value: <>{personName(lookups.people, inv.created_by)} <span className="text-muted">· {dayOf(inv.created_at, tz)}</span></> },
            ]} />

            <div>
              <h2 className="mb-2 text-[0.9375rem] font-medium text-muted">Invoice file</h2>
              {inv.file_path && signed?.signedUrl ? (
                <a href={signed.signedUrl} target="_blank" rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-ink no-underline transition-colors hover:border-brand-line hover:bg-surface-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text"><FileText aria-hidden className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:underline">{attachmentName(inv.file_path)}</span>
                    <span className="block text-sm text-muted">Opens in a new tab</span>
                  </span>
                  <ExternalLink aria-hidden className="size-4 shrink-0 text-muted" />
                </a>
              ) : inv.file_path ? (
                <p className="text-[0.9375rem] text-muted">The file could not be opened. Try again in a moment.</p>
              ) : (
                <p className="text-[0.9375rem] text-muted">
                  No file attached.{inv.status === "received" && <> <Link href={`${base}/invoices/${id}/edit`}>Attach the invoice</Link> so others can check it.</>}
                </p>
              )}
            </div>
          </Card>

          {/* On phones the approval actions come first, so nobody has to scroll past the details to approve. */}
          <Card className={`flex flex-col gap-4 self-start ${inv.status === "paid" ? "" : "order-first lg:order-none"}`}>
            <SectionHeader icon={BadgeCheck} title="Approvals" className="!mb-0"
              description={<>{Math.min(given.length, need)} of {need} {need === 1 ? "approval" : "approvals"}<span className="lg:hidden"> · {money(total, cur)}</span></>} />
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: need }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < given.length ? "bg-ok" : "bg-surface-2 ring-1 ring-inset ring-line"}`} />
              ))}
            </div>
            {given.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {given.map((a) => {
                  const name = personName(lookups.people, a.approver_id);
                  return (
                    <li key={a.approver_id} className="flex items-center gap-3">
                      <Avatar name={name} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{name}{a.approver_id === s.userId && <span className="font-normal text-muted"> (you)</span>}</div>
                        <div className="text-sm text-muted">{dayOf(a.approved_at, tz)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[0.9375rem] text-muted">No approvals yet.</p>
            )}
            <p className="hint">{need === 2 ? `Invoices over ${threshold} need two different people to approve.` : `Invoices up to ${threshold} need one approval.`}</p>

            <InvoiceActions
              status={inv.status}
              canApprove={!mine}
              approveNote={mine ? "You have approved this invoice. It now needs someone else's approval." : null}
              today={today}
              approve={approveInvoice.bind(null, s.community.slug, id)}
              pay={markInvoicePaid.bind(null, s.community.slug, id)}
              dispute={disputeInvoice.bind(null, s.community.slug, id)}
              reopen={reopenInvoice.bind(null, s.community.slug, id)}
            />
          </Card>
        </div>

        <Card>
          <SectionHeader icon={History} title="History" description="Every change to this invoice, newest first" />
          {history.length ? (
            <ol className="relative ml-4 flex flex-col gap-4 border-l border-line pl-8">
              {history.map((h) => {
                const who = personName(lookups.people, h.actor);
                return (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-12 top-0"><Avatar name={who} size="sm" className="ring-4 ring-surface" /></span>
                    <div className="text-[0.9375rem] text-ink">
                      {summarise(h, lookups, cur)}
                      {h.table_name === "invoices" && h.new_data?.status === "disputed" && h.old_data?.status !== "disputed" && h.new_data?.dispute_reason
                        ? <span className="text-muted">: {String(h.new_data.dispute_reason)}</span> : null}
                    </div>
                    <div className="text-sm text-muted">
                      {who} · {shortDateTime(h.at, tz)} · <Link href={`${base}/audit/${h.id}`} className="font-medium">Details</Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="flex items-center gap-2 text-[0.9375rem] text-muted"><Receipt aria-hidden className="size-4" /> No changes recorded yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
