import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Building2, CalendarClock, Download, FileText, Pencil, Receipt, RefreshCw, Square } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Button, Card, DefinitionList, Notice, SectionHeader, StatusBadge } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { ConfirmDialog } from "@/components/finance-ops/ConfirmDialog";
import { Flash } from "@/components/finance-ops/Flash";
import { daysBetween, displayFileName, lengthLabel, monthsBetween, perPeriod, relativeDays, FREQUENCIES } from "@/components/finance-ops/dates";
import { signedFinanceUrls } from "@/components/finance-ops/storage";
import { endContract } from "../actions";

export const metadata = { title: "Contract" };

const SAVED: Record<string, string> = {
  new: "Contract added.",
  updated: "Changes saved.",
  ended: "Contract ended. It no longer counts towards active contracts.",
};

export default async function ContractPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { community, id } = await params;
  const { saved, error } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}/finance/contracts`;
  const today = todayInput(s.community.timezone);
  const cur = s.community.currency;

  const [{ data: k }, { data: invoices }] = await Promise.all([
    supabase.from("contracts")
      .select("*, supplier:suppliers(id, name, service_type, contact_name, email, phone), category:expense_categories(name)")
      .eq("community_id", c).eq("id", id).maybeSingle(),
    supabase.from("invoices").select("id, invoice_number, issue_date, total_cents, status")
      .eq("community_id", c).eq("contract_id", id).order("issue_date", { ascending: false }),
  ]);
  if (!k) notFound();

  const supplier = k.supplier as { id: string; name: string; service_type: string; contact_name: string | null; email: string | null; phone: string | null } | null;
  const files = await signedFinanceUrls([k.file_path]);
  const fileUrl = k.file_path ? files.get(k.file_path) : undefined;

  const noticeDeadline: string | null = k.end_date
    ? new Date(Date.parse(`${k.end_date}T00:00:00Z`) - k.notice_period_days * 86_400_000).toISOString().slice(0, 10)
    : null;
  const noticeDays = noticeDeadline ? daysBetween(today, noticeDeadline) : null;
  const endDays = k.end_date ? daysBetween(today, k.end_date) : null;
  const active = k.status === "active";
  const perYear = FREQUENCIES.find((f) => f.value === k.billing_frequency)?.perYear ?? 1;
  const annual = Number(k.amount_cents) * perYear;
  const vatRate = Number(k.vat_rate);
  const months = k.end_date ? monthsBetween(k.start_date, k.end_date) : null;

  const list = invoices ?? [];
  const year = today.slice(0, 4);
  const invoicedThisYear = list.filter((i) => i.issue_date.startsWith(year) && i.status !== "disputed").reduce((t, i) => t + Number(i.total_cents), 0);

  type Tile = { label: string; main: string; sub: string; tone?: "bad" | "warn" };
  const tiles: Tile[] = active
    ? [
        {
          label: "Notice deadline",
          main: noticeDeadline ? (noticeDays! >= 0 ? relativeDays(noticeDays!) : "Passed") : "Any time",
          sub: noticeDeadline ? date(noticeDeadline) : `${k.notice_period_days} days' notice`,
          tone: noticeDays != null && noticeDays >= 0 && noticeDays <= 30 ? "bad" : noticeDays != null && noticeDays >= 0 && noticeDays <= 60 ? "warn" : undefined,
        },
        {
          label: k.auto_renew ? "Renews" : "Ends",
          main: k.end_date ? (endDays! >= 0 ? relativeDays(endDays!) : "Passed") : "Rolling",
          sub: k.end_date ? date(k.end_date) : "No end date",
          tone: endDays != null && endDays >= 0 && endDays <= 30 ? "warn" : undefined,
        },
        { label: "Started", main: date(k.start_date), sub: k.end_date ? `${lengthLabel(months)} term` : "Rolling contract" },
      ]
    : [
        { label: "Started", main: date(k.start_date), sub: k.end_date ? `${lengthLabel(months)} term` : "Rolling contract" },
        { label: k.status === "cancelled" ? "Cancelled" : "Ended", main: k.end_date ? date(k.end_date) : "–", sub: "Last day of service" },
      ];

  // Default last day: today, but never before the start (the date input refuses that) or after a passed end date.
  const endDefault = k.end_date && k.end_date < today ? k.end_date : today < k.start_date ? k.start_date : today;

  return (
    <div className="flex flex-col gap-5">
      <Toolbar
        back={{ href: base, label: "Contracts" }}
        title={k.title}
        badge={<StatusBadge value={k.status} />}
        description={supplier ? `${supplier.name} · ${supplier.service_type}` : undefined}
        actions={
          <>
            <Button href={`${base}/${k.id}/edit`} variant="secondary"><Pencil aria-hidden className="size-4" /> Edit</Button>
            <Button href={`${base}/new?from=${k.id}`} variant="secondary"><RefreshCw aria-hidden className="size-4" /> Renew</Button>
            {active && (
              <ConfirmDialog
                label="End contract"
                icon={<Square aria-hidden className="size-4" />}
                title="End this contract?"
                description={`${k.title} with ${supplier?.name ?? "this supplier"} will be marked as ended. Its invoices stay as they are.`}
                confirmLabel="End contract"
                pendingLabel="Ending…"
                action={endContract.bind(null, slug, k.id)}
              >
                <div className="field">
                  <label htmlFor="end_date">Last day of service</label>
                  <input id="end_date" name="end_date" type="date" className="input" defaultValue={endDefault} min={k.start_date} required />
                </div>
              </ConfirmDialog>
            )}
          </>
        }
      />

      {((saved && SAVED[saved]) || error) && (
        <Flash>
          {saved && SAVED[saved] && <Notice tone="ok">{SAVED[saved]}</Notice>}
          {error && <Notice tone="bad">{error === "end" ? "The contract could not be ended. Please try again." : "That did not work. Please try again."}</Notice>}
        </Flash>
      )}
      {active && k.auto_renew && noticeDays != null && noticeDays >= 0 && noticeDays <= 60 && (
        <Notice tone={noticeDays <= 30 ? "bad" : "warn"} title={`Notice deadline ${relativeDays(noticeDays)}`}>
          This contract renews automatically on {date(k.end_date)} unless notice is given by {date(noticeDeadline)}.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <SectionHeader icon={CalendarClock} title="Key dates" />
            <ul className={clsx("grid gap-3", tiles.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {tiles.map((t) => (
                <li key={t.label} className={clsx("rounded-xl px-4 py-3", t.tone === "bad" ? "bg-bad-soft" : t.tone === "warn" ? "bg-warn-soft" : "bg-surface-2")}>
                  <div className="text-sm text-muted">{t.label}</div>
                  <div className={clsx("mt-0.5 text-[1.25rem] font-semibold leading-snug first-letter:uppercase",
                    t.tone === "bad" && "text-bad", t.tone === "warn" && "text-warn")}>{t.main}</div>
                  <div className="text-sm text-muted">{t.sub}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionHeader icon={FileText} title="Details" />
            <DefinitionList items={[
              { label: "Service", value: k.title },
              { label: "Budget category", value: k.category?.name ?? "None" },
              { label: "Term", value: k.end_date ? `${date(k.start_date)} to ${date(k.end_date)}` : `From ${date(k.start_date)}, rolling` },
              { label: "Notice period", value: `${k.notice_period_days} days` },
              { label: "Renews automatically", value: k.auto_renew ? "Yes" : "No" },
              { label: "Price review", value: k.price_review_clause ?? <span className="text-muted">No clause recorded</span> },
              ...(k.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{k.notes}</span> }] : []),
            ]} />
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeader icon={Receipt} title="Invoices"
                description={list.length ? `${money(invoicedThisYear, cur)} invoiced in ${year}` : "No invoices are linked to this contract yet."} />
            </div>
            {list.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {list.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <Link href={`/${slug}/finance/invoices/${i.id}`} className="font-medium no-underline hover:underline">{i.invoice_number}</Link>
                      <div className="text-sm text-muted">{date(i.issue_date)}</div>
                    </div>
                    <StatusBadge value={i.status} />
                    <div className="tabular w-24 text-right text-[0.9375rem] text-ink">{money(i.total_cents, cur)}</div>
                  </li>
                ))}
              </ul>
            )}
            {list.length > 6 && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted sm:px-6">
                Latest 6 of {list.length}. <Link href={`/${slug}/finance/invoices?q=${encodeURIComponent(supplier?.name ?? "")}`}>See all invoices</Link>
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="text-sm text-muted">Price</div>
            <div className="tabular mt-1 text-[1.75rem] font-semibold leading-none">{money(k.amount_cents, cur)}</div>
            <div className="mt-1.5 text-[0.9375rem] text-muted">{perPeriod(k.billing_frequency)}, before VAT</div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[0.9375rem]">
              <div>
                <dt className="text-sm text-muted">{k.billing_frequency === "one_off" ? "Total" : "Per year"}</dt>
                <dd className="tabular font-medium">{money(annual, cur)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">With {vatRate}% VAT</dt>
                <dd className="tabular font-medium">{money(Math.round(annual * (1 + vatRate / 100)), cur)}</dd>
              </div>
            </dl>
          </Card>

          {supplier && (
            <Card>
              <SectionHeader icon={Building2} title={supplier.name} description={supplier.contact_name ?? supplier.service_type} />
              <ContactActions name={supplier.contact_name ?? supplier.name} phone={supplier.phone} email={supplier.email} variant="buttons" />
              {supplier.phone && <p className="tabular mt-3 text-[0.9375rem] text-ink-2">{supplier.phone}</p>}
              {supplier.email && <p className="truncate text-[0.9375rem] text-ink-2">{supplier.email}</p>}
            </Card>
          )}

          <Card>
            <SectionHeader icon={FileText} title="Signed contract" />
            {k.file_path && fileUrl ? (
              <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-ink no-underline transition-colors hover:bg-surface-2">
                <Download aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 truncate text-[0.9375rem] font-medium">{displayFileName(k.file_path)}</span>
              </a>
            ) : k.file_path ? (
              <p className="text-[0.9375rem] text-muted">The file could not be found. Upload it again from Edit.</p>
            ) : (
              <p className="text-[0.9375rem] text-muted">No file yet. <Link href={`${base}/${k.id}/edit`}>Upload the signed contract</Link></p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
