import { History } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Empty } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceToolbar from "@/components/finance/FinanceToolbar";
import { ACTION_LABELS, AREA_LABELS, type AuditRow, recordLabel, summarise } from "@/components/finance/audit";
import { loadLookups } from "@/components/finance/lookups";
import { personName } from "@/components/finance/people";

export const metadata = { title: "Audit log" };

const LIMIT = 1000;

export default async function AuditPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/audit`;
  const tz = s.community.timezone;

  const [{ data, count }, lookups] = await Promise.all([
    supabase.from("audit_log").select("id, at, table_name, record_id, action, actor, old_data, new_data", { count: "exact" })
      .eq("community_id", c).order("at", { ascending: false }).order("id", { ascending: false }).limit(LIMIT),
    loadLookups(supabase, c),
  ]);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const rows = ((data ?? []) as AuditRow[]).map((r) => ({
    id: r.id,
    at: r.at,
    time: time.format(new Date(r.at)),
    who: personName(lookups.people, r.actor),
    area: AREA_LABELS[r.table_name] ?? r.table_name,
    action: ACTION_LABELS[r.action] ?? r.action,
    record: recordLabel(r.table_name, r.new_data ?? r.old_data, lookups, s.community.currency),
    change: summarise(r, lookups, s.community.currency),
  }));

  const columns: Column[] = [
    { key: "at", header: "When", type: "date", subKey: "time" },
    { key: "record", header: "Record", href: `${base}/{id}`, subKey: "change", primary: true },
    { key: "area", header: "Area", filter: true, mobileHidden: true },
    { key: "action", header: "Action", filter: true, mobileHidden: true },
    { key: "who", header: "Who", filter: true },
  ];

  return (
    <>
      <FinanceToolbar title="Audit log"
        meta={(count ?? 0) > LIMIT
          ? `The latest ${LIMIT.toLocaleString("en-GB")} of ${(count ?? 0).toLocaleString("en-GB")} changes. Records cannot be edited or deleted.`
          : "Every change to finance records: who, when, and what changed. It cannot be edited."} />
      {rows.length === 0 ? (
        <Empty icon={History} title="Nothing recorded yet">
          Changes to invoices, suppliers, contracts, budgets and owner fees appear here as soon as they are made.
        </Empty>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          dateKey="at"
          defaultSort={{ key: "at", desc: true }}
          currency={s.community.currency}
          exportName="audit-log"
          searchPlaceholder="Search records, people, changes…"
          empty="No changes match these filters."
          views={[
            { label: "Invoices", params: { f_area: "Invoices" } },
            { label: "Approvals", params: { f_area: "Approvals" } },
            { label: "Suppliers", params: { f_area: "Suppliers" } },
            { label: "Deletions", params: { f_action: "Deleted" } },
          ]}
        />
      )}
    </>
  );
}
