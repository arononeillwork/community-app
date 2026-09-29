import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ExternalLink } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, humanize, money, todayInput } from "@/lib/format";
import { Badge, Button, Card, Notice, PageHeader, STATUS_LABELS, StatusBadge } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import { lookupNames } from "@/components/finance/names";
import { approvalThreshold, daysBetween, plural, requiredApprovals } from "@/components/finance/invoice-utils";
import InvoiceActions from "./InvoiceActions";

export const metadata = { title: "Invoice" };

type Invoice = {
  id: string;
  community_id: string;
  supplier_id: string;
  contract_id: string | null;
  category_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  status: "received" | "approved" | "paid" | "disputed";
  paid_date: string | null;
  file_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  supplier_name: string | null;
  category_name: string | null;
  contract_title: string | null;
  approvals: number | null;
  overdue: boolean | null;
};

type Approval = { approver_id: string; approved_at: string };
type AuditRow = {
  id: number;
  table_name: string;
  action: string;
  actor: string | null;
  at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const FIELD_LABELS: Record<string, string> = {
  status: "Status", paid_date: "Paid on", due_date: "Due date", issue_date: "Invoice date",
  net_cents: "Amount before VAT", vat_cents: "VAT", total_cents: "Total", notes: "Notes", file_path: "Attachment",
  supplier_id: "Supplier", contract_id: "Contract", category_id: "Category", invoice_number: "Invoice number", created_by: "Added by",
};
const SKIP_FIELDS = new Set(["id", "community_id", "created_at"]);

function short(text: string, max = 140) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** What changed between two versions of an invoice, in plain words. */
function describeChanges(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null, currency: string) {
  const o = oldData ?? {};
  const n = newData ?? {};
  const out: string[] = [];
  const fmt = (key: string, v: unknown) => {
    if (v == null || v === "") return "empty";
    if (key.endsWith("_cents")) return money(Number(v), currency);
    if (key.endsWith("_date")) return date(String(v));
    if (key === "status") return STATUS_LABELS[String(v)] ?? humanize(String(v));
    return short(String(v), 60);
  };
  for (const key of Array.from(new Set([...Object.keys(o), ...Object.keys(n)]))) {
    if (SKIP_FIELDS.has(key)) continue;
    if (JSON.stringify(o[key] ?? null) === JSON.stringify(n[key] ?? null)) continue;
    const label = FIELD_LABELS[key] ?? humanize(key);
    const before = o[key];
    const after = n[key];
    if (key === "notes") {
      const b = String(before ?? "").trim();
      const a = String(after ?? "").trim();
      if (!a) out.push("Notes removed");
      else if (b && a.startsWith(b)) out.push(`Note added: “${short(a.slice(b.length).trim())}”`);
      else out.push(`Notes changed to: “${short(a)}”`);
    } else if (key === "file_path") {
      out.push(!before ? "Attachment added" : !after ? "Attachment removed" : "Attachment replaced");
    } else if (key.endsWith("_id") || key === "created_by") {
      out.push(`${label} changed`);
    } else {
      out.push(`${label}: ${fmt(key, before)} → ${fmt(key, after)}`);
    }
  }
  return out;
}

export default async function InvoiceDetailPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { community, id } = await params;
  const { added } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const tz = s.community.timezone;
  const currency = s.community.currency;
  const today = todayInput(tz);

  const { data } = await supabase.from("v_invoice_list").select("*").eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice;

  const [{ data: approvalsData }, { data: invoiceAudit }, { data: approvalAudit }, signed] = await Promise.all([
    supabase.from("invoice_approvals").select("approver_id, approved_at").eq("invoice_id", inv.id).order("approved_at"),
    supabase.from("audit_log").select("id, table_name, action, actor, at, old_data, new_data")
      .eq("community_id", s.community.id).eq("table_name", "invoices").eq("record_id", inv.id)
      .order("at").limit(200),
    supabase.from("audit_log").select("id, table_name, action, actor, at, old_data, new_data")
      .eq("community_id", s.community.id).eq("table_name", "invoice_approvals").eq("new_data->>invoice_id", inv.id)
      .order("at").limit(50),
    inv.file_path ? supabase.storage.from("finance").createSignedUrl(inv.file_path, 3600) : Promise.resolve(null),
  ]);

  const approvals = (approvalsData ?? []) as Approval[];
  const history = ([...(invoiceAudit ?? []), ...(approvalAudit ?? [])] as AuditRow[])
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  const names = await lookupNames(supabase, s.community.id, [
    ...approvals.map((a) => a.approver_id), ...history.map((h) => h.actor), inv.created_by,
  ]);
  /** Name for a profile id: "You", the name if readable, or a neutral label. `nobody` is used when there is no id at all. */
  const who = (pid: string | null | undefined, nobody = "Committee member") =>
    !pid ? nobody : pid === s.userId ? "You" : names.get(pid) ?? "Committee member";

  const threshold = approvalThreshold(s.community.settings);
  const required = requiredApprovals(inv.total_cents, threshold);
  const approvalCount = approvals.length || Number(inv.approvals ?? 0);
  const iApproved = approvals.some((a) => a.approver_id === s.userId);
  const overdueDays = inv.overdue && inv.due_date ? Math.max(1, daysBetween(inv.due_date, today)) : 0;
  const vatRate = inv.net_cents > 0 ? Math.round((inv.vat_cents / inv.net_cents) * 1000) / 10 : 0;

  const fileUrl = signed && !signed.error ? signed.data?.signedUrl ?? null : null;
  const isPdf = !!inv.file_path && inv.file_path.toLowerCase().endsWith(".pdf");

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoice_number}`}
        intro={<>From {inv.supplier_name ?? "an unknown supplier"} · {money(inv.total_cents, currency)} including VAT</>}
        back={{ href: `${base}/finance/invoices`, label: "All invoices" }}
      />
      <FinanceNav slug={s.community.slug} />

      {added && inv.status === "received" && approvalCount === 0 && (
        <div className="mb-5">
          <Notice tone="ok">The invoice has been saved. It now needs {required === 1 ? "1 approval" : "2 approvals"} before it can be paid.</Notice>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* What to do next (first on phones) */}
        <Card className="flex flex-col gap-4 lg:order-2">
          <h2 className="text-xl font-bold">What happens next</h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={inv.status} />
            {inv.overdue && <Badge tone="bad">Overdue by {plural(overdueDays, "day")}</Badge>}
          </div>
          <p className="text-lg">
            <strong className="tabular">{approvalCount} of {required}</strong> approvals.{" "}
            <span className="text-muted">
              {required === 2
                ? `Invoices over ${money(threshold, currency)} need 2 committee members to approve them.`
                : "This invoice needs 1 committee member to approve it."}
            </span>
          </p>
          <InvoiceActions
            slug={s.community.slug}
            id={inv.id}
            status={inv.status}
            approvals={approvalCount}
            required={required}
            iApproved={iApproved}
            today={today}
            paidDateLabel={inv.paid_date ? date(inv.paid_date) : null}
          />
        </Card>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1">
          <Card>
            <h2 className="mb-3 text-xl font-bold">Details</h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
              <dt className="font-bold">Supplier</dt>
              <dd>
                <Link href={`${base}/finance/suppliers/${inv.supplier_id}`} className="font-bold text-brand underline-offset-4 hover:underline">
                  {inv.supplier_name ?? "Supplier"}
                </Link>
              </dd>
              <dt className="font-bold">Contract</dt>
              <dd>
                {inv.contract_id ? (
                  <Link href={`${base}/finance/contracts/${inv.contract_id}`} className="font-bold text-brand underline-offset-4 hover:underline">
                    {inv.contract_title ?? "Contract"}
                  </Link>
                ) : <span className="text-muted">None (a one-off job)</span>}
              </dd>
              <dt className="font-bold">Category</dt><dd>{inv.category_name ?? "Uncategorised"}</dd>
              <dt className="font-bold">Invoice number</dt><dd>{inv.invoice_number}</dd>
              <dt className="font-bold">Invoice date</dt><dd>{date(inv.issue_date)}</dd>
              <dt className="font-bold">Due date</dt>
              <dd>
                {date(inv.due_date)}
                {inv.overdue && <span className="ml-2 font-bold text-bad">Overdue by {plural(overdueDays, "day")}</span>}
              </dd>
              <dt className="font-bold">Amount before VAT</dt><dd className="tabular">{money(inv.net_cents, currency)}</dd>
              <dt className="font-bold">VAT</dt><dd className="tabular">{money(inv.vat_cents, currency)} <span className="text-muted">({vatRate}%)</span></dd>
              <dt className="font-bold">Total</dt><dd className="tabular text-lg font-bold">{money(inv.total_cents, currency)}</dd>
              <dt className="font-bold">Status</dt><dd><StatusBadge value={inv.status} /></dd>
              {inv.paid_date && (<><dt className="font-bold">Paid on</dt><dd>{date(inv.paid_date)}</dd></>)}
              <dt className="font-bold">Added</dt>
              <dd>{dateTime(inv.created_at, tz)}{inv.created_by ? ` by ${who(inv.created_by)}` : ""}</dd>
              <dt className="font-bold">Notes</dt>
              <dd className="whitespace-pre-line">{inv.notes?.trim() ? inv.notes : <span className="text-muted">No notes</span>}</dd>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Invoice file</h2>
            {!inv.file_path ? (
              <p className="text-muted">No file was attached to this invoice.</p>
            ) : !fileUrl ? (
              <Notice tone="warn">The file could not be opened right now. Please reload the page to try again.</Notice>
            ) : isPdf ? (
              <Button href={fileUrl} external variant="secondary" size="lg">
                <FileText aria-hidden className="size-6" /> Open the invoice PDF
                <ExternalLink aria-hidden className="size-5" /><span className="sr-only">(opens in a new tab)</span>
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block w-fit">
                  {/* Signed Supabase URL (expires), so next/image optimisation is not useful here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- scanned invoice of unknown size behind a short-lived signed URL; images are unoptimized app-wide (next.config) */}
                  <img src={fileUrl} alt={`Photo of invoice ${inv.invoice_number} from ${inv.supplier_name ?? "the supplier"}`}
                    className="max-h-[32rem] rounded-xl border border-line object-contain" />
                </a>
                <Button href={fileUrl} external variant="secondary">
                  <ExternalLink aria-hidden className="size-5" /> Open full size<span className="sr-only"> (opens in a new tab)</span>
                </Button>
              </div>
            )}
            <p className="hint mt-2">The link to the file works for one hour, for your privacy.</p>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Approvals</h2>
            {approvals.length === 0 ? (
              <p className="text-muted">Nobody has approved this invoice yet.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {approvals.map((a) => (
                  <li key={a.approver_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-4 border-ok bg-bg p-3">
                    <span className="font-bold">{a.approver_id === s.userId ? (s.fullName || "You") : names.get(a.approver_id) ?? "Committee member"}</span>
                    <span className="text-muted">{dateTime(a.approved_at, tz)}</span>
                    {a.approver_id === s.userId && <Badge tone="ok">You approved this</Badge>}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3">
              {approvalCount >= required
                ? "It has enough approvals."
                : `It needs ${plural(required - approvalCount, "more approval")} from ${required - approvalCount === 1 && iApproved ? "another committee member" : "the committee"}.`}
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">History</h2>
            {history.length === 0 ? (
              <p className="text-muted">No changes have been recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map((h) => {
                  let what: string[];
                  if (h.table_name === "invoice_approvals") what = [h.action === "delete" ? "Approval removed" : "Approved"];
                  else if (h.action === "insert") what = ["Invoice added"];
                  else if (h.action === "delete") what = ["Invoice deleted"];
                  else what = describeChanges(h.old_data, h.new_data, currency);
                  if (what.length === 0) what = ["Saved without changes"];
                  return (
                    <li key={`${h.table_name}-${h.id}`} className="rounded-xl border-l-4 border-line-strong bg-bg p-3">
                      <div className="text-sm text-muted">{dateTime(h.at, tz)} · {who(h.actor, "Automatic (system)")}</div>
                      <ul className="mt-1">
                        {what.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
