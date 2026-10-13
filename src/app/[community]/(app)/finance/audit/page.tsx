import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Download, History } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Empty, Notice, buttonClass } from "@/components/ui";
import FinanceHeader from "@/components/finance/FinanceHeader";
import AuditFilterForm from "@/components/finance/AuditFilterForm";
import { ACTION_LABELS, AREA_LABELS, type AuditRow, recordLabel, summarise } from "@/components/finance/audit";
import { AUDIT_PAGE_SIZE, activeFilterCount, auditQuery, auditSearch, parseAuditFilters } from "@/components/finance/audit-query";
import { loadLookups } from "@/components/finance/lookups";
import { personName } from "@/components/finance/people";
import { isoDayOf } from "@/components/finance/dates";
import { todayInput } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/audit`;
  const tz = s.community.timezone;
  const cur = s.community.currency;

  const filters = parseAuditFilters(sp);
  const active = activeFilterCount(filters);
  const asked = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const page = Number.isInteger(asked) && asked > 1 ? asked : 1;
  const offset = (page - 1) * AUDIT_PAGE_SIZE;

  const [{ data, count, error }, lookups, { data: actors }] = await Promise.all([
    auditQuery(supabase, c, filters, tz, "exact")
      .order("at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + AUDIT_PAGE_SIZE - 1),
    loadLookups(supabase, c),
    supabase.rpc("audit_log_actors", { c }),
  ]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  // A page past the end (old link, fewer results after filtering): go to the last one.
  if (!error && page > pages) redirect(`${base}${auditSearch(filters, { page: pages > 1 ? pages : null })}`);

  const today = todayInput(tz);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const dayLabel = (d: string) => d === today ? "Today" : d === yesterday ? "Yesterday"
    : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  // Newest first, grouped by the community's calendar day.
  const days: { day: string; rows: { id: number; record: string; change: string; who: string; area: string; time: string }[] }[] = [];
  for (const r of (data ?? []) as AuditRow[]) {
    const day = isoDayOf(r.at, tz);
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push({
      id: r.id,
      record: recordLabel(r.table_name, r.new_data ?? r.old_data, lookups, cur),
      change: summarise(r, lookups, cur),
      who: personName(lookups.people, r.actor),
      area: AREA_LABELS[r.table_name] ?? r.table_name,
      time: time.format(new Date(r.at)),
    });
  }

  const people = ((actors ?? []) as { actor: string | null }[])
    .map((a) => ({ value: a.actor ?? "system", label: personName(lookups.people, a.actor) }))
    .sort((a, b) => (a.value === "system" ? 1 : b.value === "system" ? -1 : a.label.localeCompare(b.label)));
  const exportHref = `${base}/export${auditSearch(filters)}`;
  const first = offset + 1;
  const last = Math.min(offset + AUDIT_PAGE_SIZE, total);

  return (
    <>
      <FinanceHeader title="Audit log"
        intro="Every change to finance records: who made it, when, and what changed. It cannot be edited."
        actions={total > 0 ? (
          // A plain link: the export is a file download, not a page.
          <a href={exportHref} download className={buttonClass("secondary")}
            title={active ? "Download every change that matches these filters (CSV)" : "Download the whole log (CSV)"}>
            <Download aria-hidden className="size-4" /> Export
          </a>
        ) : undefined} />

      <AuditFilterForm values={filters} active={active}
        areas={Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))}
        actions={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
        people={people} />

      {error ? (
        <Notice tone="bad">The audit log could not be loaded. Please refresh the page.</Notice>
      ) : total === 0 ? (
        active ? (
          <Empty icon={History} title="No changes match these filters" action={<Button href={base} variant="secondary">Clear filters</Button>}>
            Try a wider date range or another person.
          </Empty>
        ) : (
          <Empty icon={History} title="Nothing recorded yet">
            Changes to invoices, suppliers, contracts, budgets and owner fees appear here as soon as they are made.
          </Empty>
        )
      ) : (
        <>
          <p className="mb-3 text-[0.9375rem] text-muted">
            {total <= AUDIT_PAGE_SIZE
              ? `${total.toLocaleString("en-GB")} ${total === 1 ? "change" : "changes"}`
              : `${first.toLocaleString("en-GB")}–${last.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} changes`}
            {active ? " matching these filters" : ""}
          </p>
          <Card padded={false} className="overflow-hidden">
            {days.map((d) => (
              <section key={d.day} aria-labelledby={`day-${d.day}`} className="border-b border-line last:border-b-0">
                <h2 id={`day-${d.day}`} className="bg-surface-2 px-5 py-2 text-sm font-medium text-muted sm:px-6">{dayLabel(d.day)}</h2>
                <ul className="divide-y divide-line border-t border-line">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      {/* Phones: two lines. Wider screens: time, change, who and area in columns. */}
                      <Link href={`${base}/${r.id}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 text-ink no-underline transition-colors hover:bg-surface-2 sm:px-6 md:grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,8rem)_auto]">
                        <span className="hidden text-[0.9375rem] tabular text-muted md:block">{r.time}</span>
                        <span className="min-w-0">
                          <span className="block font-medium [overflow-wrap:anywhere] group-hover:underline">{r.record}</span>
                          <span className="block text-[0.9375rem] text-ink-2">
                            {r.change}<span className="text-muted md:hidden"> · <span className="tabular">{r.time}</span> · {r.who}</span>
                          </span>
                        </span>
                        <span className="hidden min-w-0 text-[0.9375rem] text-ink-2 md:block">{r.who}</span>
                        <span className="hidden min-w-0 text-[0.9375rem] text-muted md:block">{r.area}</span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>

          {pages > 1 && (
            <nav aria-label="Audit log pages" className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
              {page > 1 ? (
                <Link href={`${base}${auditSearch(filters, { page: page - 1 > 1 ? page - 1 : null })}`} className={buttonClass("secondary", "md")}>
                  <ChevronLeft aria-hidden className="size-4" /> Newer
                </Link>
              ) : <span />}
              <span className="text-[0.9375rem] text-muted">Page {page} of {pages}</span>
              {page < pages ? (
                <Link href={`${base}${auditSearch(filters, { page: page + 1 })}`} className={buttonClass("secondary", "md")}>
                  Older <ChevronRight aria-hidden className="size-4" />
                </Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
