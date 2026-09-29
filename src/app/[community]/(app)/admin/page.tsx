import Link from "next/link";
import { AlertTriangle, CalendarDays, Coins, Settings, Users } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { humanize, todayInput } from "@/lib/format";
import { Notice, PageHeader, Stat } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import AdminNav from "@/components/admin/AdminNav";
import SummaryTable, { type SummaryRow } from "@/components/admin/SummaryTable";
import { OPEN_REPORT_STATUSES, TARGET_LABELS } from "@/components/admin/labels";

export const metadata = { title: "Administration" };

type Tally = {
  month: string;
  kind: string;
  category_name: string;
  target_type: string;
  target_name: string;
  status: string;
  complaint_count: number;
};

const OPEN = [...OPEN_REPORT_STATUSES] as string[];
const TARGET_ORDER = ["unit", "owner", "supplier", "common_area"];

/** Month keys ("YYYY-MM") for the 12 months ending with the month of `today` (YYYY-MM-DD). */
function last12Months(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const out: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) });
  }
  return out;
}

/** "2026-02-01" → "2026-02 (February)": readable, and still sorts in date order. */
function monthCell(iso: string) {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${iso.slice(0, 7)} (${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })})`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function AdminPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cid = s.community.id;

  const [openRes, urgentRes, pendingRes, membersRes, talliesRes] = await Promise.all([
    supabase.from("complaints").select("id", { count: "exact", head: true }).eq("community_id", cid).in("status", OPEN),
    supabase.from("complaints").select("id", { count: "exact", head: true }).eq("community_id", cid).in("status", OPEN).eq("priority", "urgent"),
    supabase.from("tenancies").select("id", { count: "exact", head: true }).eq("community_id", cid).eq("status", "pending"),
    supabase.from("memberships").select("profile_id").eq("community_id", cid).eq("status", "active"),
    supabase.from("v_complaint_tallies")
      .select("month, kind, category_name, target_type, target_name, status, complaint_count")
      .eq("community_id", cid)
      .order("month", { ascending: false }),
  ]);

  const openCount = openRes.count ?? 0;
  const urgentCount = urgentRes.count ?? 0;
  const pendingCount = pendingRes.count ?? 0;
  const memberCount = new Set((membersRes.data ?? []).map((m) => String(m.profile_id))).size;
  const loadFailed = !!(openRes.error || urgentRes.error || pendingRes.error || membersRes.error || talliesRes.error);

  const tallies: Tally[] = (talliesRes.data ?? []).map((t) => ({
    month: String(t.month ?? ""),
    kind: String(t.kind ?? "complaint"),
    category_name: String(t.category_name ?? "Other"),
    target_type: String(t.target_type ?? "common_area"),
    target_name: String(t.target_name ?? "Common area"),
    status: String(t.status ?? "new"),
    complaint_count: Number(t.complaint_count) || 0,
  }));

  // ---- Summaries (built here so the page stays fast and printable) ----
  const byCategory = new Map<string, { total: number; open: number }>();
  const byTarget = new Map<string, { total: number; open: number; names: Map<string, number> }>();
  for (const t of tallies) {
    const isOpen = OPEN.includes(t.status);
    const c = byCategory.get(t.category_name) ?? { total: 0, open: 0 };
    c.total += t.complaint_count;
    if (isOpen) c.open += t.complaint_count;
    byCategory.set(t.category_name, c);

    const g = byTarget.get(t.target_type) ?? { total: 0, open: 0, names: new Map<string, number>() };
    g.total += t.complaint_count;
    if (isOpen) g.open += t.complaint_count;
    g.names.set(t.target_name, (g.names.get(t.target_name) ?? 0) + t.complaint_count);
    byTarget.set(t.target_type, g);
  }

  const categoryRows: SummaryRow[] = [...byCategory.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([name, v]) => ({ key: name, cells: { name, total: v.total, open: v.open } }));

  const targetRows: SummaryRow[] = [...byTarget.entries()]
    .sort((a, b) => TARGET_ORDER.indexOf(a[0]) - TARGET_ORDER.indexOf(b[0]))
    .map(([type, v]) => {
      const top = [...v.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
      return {
        key: type,
        cells: {
          name: TARGET_LABELS[type] ?? humanize(type),
          total: v.total,
          open: v.open,
          top: top.map(([n, c]) => `${n} (${c})`).join(", "),
        },
      };
    });

  const months = last12Months(todayInput(s.community.timezone));
  const monthMap = new Map(months.map((m) => [m.key, { incidents: 0, complaints: 0 }]));
  for (const t of tallies) {
    const slot = monthMap.get(t.month.slice(0, 7));
    if (!slot) continue;
    if (t.kind === "incident") slot.incidents += t.complaint_count;
    else slot.complaints += t.complaint_count;
  }
  const monthRows: SummaryRow[] = months.slice().reverse().map((m) => {
    const v = monthMap.get(m.key) ?? { incidents: 0, complaints: 0 };
    return { key: m.key, cells: { name: m.label, incidents: v.incidents, complaints: v.complaints, total: v.incidents + v.complaints } };
  });
  const monthTotals = monthRows.reduce(
    (acc, r) => ({
      incidents: acc.incidents + Number(r.cells.incidents), complaints: acc.complaints + Number(r.cells.complaints),
      total: acc.total + Number(r.cells.total),
    }),
    { incidents: 0, complaints: 0, total: 0 },
  );
  const sum = (rows: SummaryRow[], key: string) => rows.reduce((n, r) => n + Number(r.cells[key] ?? 0), 0);

  // ---- Detailed tally table (flat rows for the DataTable) ----
  const tallyRows = tallies.map((t, i) => ({
    id: String(i),
    month: t.month,
    month_label: monthCell(t.month),
    kind: t.kind,
    category_name: t.category_name,
    target_type: TARGET_LABELS[t.target_type] ?? humanize(t.target_type),
    target_name: t.target_name,
    status: t.status,
    complaint_count: t.complaint_count,
  }));

  const tallyColumns: Column[] = [
    { key: "month_label", header: "Month" },
    { key: "kind", header: "Type", type: "status", filter: true },
    { key: "category_name", header: "Category", filter: true, primary: true },
    { key: "target_type", header: "About", filter: true },
    { key: "target_name", header: "Which one", filter: true },
    { key: "status", header: "Status", type: "status", filter: true },
    { key: "complaint_count", header: "Reports", type: "number", total: true },
  ];

  const links = [
    { href: `${base}/admin/people`, label: "People & flats", text: "Owners, tenants and staff. Add people and approve tenants.", icon: Users },
    { href: `${base}/admin/settings`, label: "Community settings", text: "Name, languages, colours, logo and the public page.", icon: Settings },
    { href: `${base}/report`, label: "Reports", text: "Problems and complaints from residents.", icon: AlertTriangle },
    { href: `${base}/meetings`, label: "Meetings", text: "Plan meetings and share minutes.", icon: CalendarDays },
    { href: `${base}/finance`, label: "Finance", text: "Invoices, contracts, budget and owner fees.", icon: Coins },
  ];

  return (
    <>
      <AdminNav slug={s.community.slug} />
      <PageHeader title="Administration" intro={`Run ${s.community.name}: people, reports and settings.`} />

      <div className="flex flex-col gap-8">
        {loadFailed && <Notice tone="warn">Some numbers could not be loaded just now. Please refresh the page in a moment.</Notice>}

        <section aria-labelledby="at-a-glance">
          <h2 id="at-a-glance" className="mb-3 text-2xl font-bold">At a glance</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open reports" value={openCount} href={`${base}/report`}
              sub="New, seen or being worked on" tone={openCount > 0 ? "warn" : "ok"} />
            <Stat label="Urgent and open" value={urgentCount} href={`${base}/report?f_priority=urgent`}
              sub={urgentCount > 0 ? "Please look at these first" : "Nothing urgent"} tone={urgentCount > 0 ? "bad" : "ok"} />
            <Stat label="Tenants waiting for approval" value={pendingCount} href={`${base}/admin/people#pending`}
              sub={pendingCount > 0 ? "Added by landlords" : "No one waiting"} tone={pendingCount > 0 ? "warn" : "ok"} />
            <Stat label="Active members" value={memberCount} href={`${base}/admin/people`}
              sub="People who can sign in" />
          </div>
        </section>

        <nav aria-labelledby="admin-links">
          <h2 id="admin-links" className="mb-3 text-2xl font-bold">Go to</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}
                  className="card flex h-full min-h-24 items-start gap-4 rounded-card border-2 border-line bg-surface p-5 text-ink no-underline transition-colors hover:border-brand">
                  <l.icon aria-hidden className="mt-1 size-8 shrink-0 text-brand" strokeWidth={1.75} />
                  <span>
                    <span className="block text-lg font-bold underline-offset-4">{l.label}</span>
                    <span className="block text-muted">{l.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="tallies" className="flex flex-col gap-4">
          <div>
            <h2 id="tallies" className="text-2xl font-bold">Complaints &amp; incidents tallies</h2>
            <p className="text-muted">
              How many reports residents have made, grouped in different ways. An <strong>incident</strong> is something broken or
              dangerous; a <strong>complaint</strong> is about a person, a flat or a service. “Open” means not yet resolved or closed.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryTable
              caption="By category"
              columns={[{ key: "name", header: "Category" }, { key: "total", header: "All reports", numeric: true }, { key: "open", header: "Still open", numeric: true }]}
              rows={categoryRows}
              totals={{ total: sum(categoryRows, "total"), open: sum(categoryRows, "open") }}
              empty="No reports yet."
            />
            <SummaryTable
              caption="By who or what it is about"
              intro="A flat, an owner, a supplier or a shared (common) area."
              columns={[
                { key: "name", header: "About" }, { key: "total", header: "All reports", numeric: true },
                { key: "open", header: "Still open", numeric: true }, { key: "top", header: "Most reported" },
              ]}
              rows={targetRows}
              totals={{ total: sum(targetRows, "total"), open: sum(targetRows, "open") }}
              empty="No reports yet."
            />
          </div>

          <SummaryTable
            caption="By month – last 12 months"
            intro={monthTotals.total === 0 ? "No reports in the last 12 months." : `${plural(monthTotals.total, "report", "reports")} in the last 12 months.`}
            columns={[
              { key: "name", header: "Month" }, { key: "incidents", header: "Incidents", numeric: true },
              { key: "complaints", header: "Complaints", numeric: true }, { key: "total", header: "Total", numeric: true },
            ]}
            rows={monthRows}
            totals={monthTotals}
          />

          <h3 className="mt-2 text-xl font-bold">All tallies</h3>
          <p className="-mt-3 text-muted">Use the filters to look at one category, flat, supplier or status. Export gives you a spreadsheet file.</p>
          <DataTable
            id="tallies"
            rows={tallyRows}
            columns={tallyColumns}
            dateKey="month"
            defaultSort={{ key: "month_label", desc: true }}
            exportName="complaint-tallies"
            searchPlaceholder="Search tallies…"
            empty="No reports to count yet."
            views={[
              { label: "Incidents", params: { f_kind: "incident" } },
              { label: "Complaints", params: { f_kind: "complaint" } },
              { label: "New (not yet seen)", params: { f_status: "new" } },
              { label: "Last 12 months", params: { range: "12m" } },
            ]}
          />
        </section>
      </div>
    </>
  );
}
