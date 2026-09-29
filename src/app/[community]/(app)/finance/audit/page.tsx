import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import FinanceNav from "@/components/finance/FinanceNav";
import { communityNames, fetchAll } from "@/components/finance/fees/data";
import { dateInZone, timeInZone } from "@/components/finance/fees/utils";
import { actionLabel, areaLabel, recordLabel, whatChanged, type Lookups } from "./describe";

export const metadata = { title: "Audit log" };

const LIMIT = 1000;

type AuditRow = {
  id: number; table_name: string; record_id: string | null; action: string; actor: string | null; at: string;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};

export default async function AuditLogPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const cid = s.community.id;
  const tz = s.community.timezone;

  const [logRes, countRes] = await Promise.all([
    supabase.from("audit_log").select("id, table_name, record_id, action, actor, at, old_data, new_data")
      .eq("community_id", cid).order("at", { ascending: false }).order("id", { ascending: false }).limit(LIMIT),
    supabase.from("audit_log").select("id", { count: "exact", head: true }).eq("community_id", cid),
  ]);
  const log = (logRes.data ?? []) as AuditRow[];
  const totalCount = countRes.count ?? log.length;

  // Names for the ids that appear in the records (all read as the signed-in user; RLS applies).
  type Named = { id: string; name: string };
  const pick = <T,>(rows: T[], f: (r: T) => Named) => new Map(rows.map(f).map((r) => [r.id, r.name]));
  const [units, suppliers, categories, invoices, contracts, budgets, levies, schedules] = await Promise.all([
    fetchAll<{ id: string; label: string }>((a, b) => supabase.from("units").select("id, label").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; name: string }>((a, b) => supabase.from("suppliers").select("id, name").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; name: string }>((a, b) => supabase.from("expense_categories").select("id, name").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; invoice_number: string }>((a, b) => supabase.from("invoices").select("id, invoice_number").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; title: string }>((a, b) => supabase.from("contracts").select("id, title").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; name: string }>((a, b) => supabase.from("budgets").select("id, name").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; title: string }>((a, b) => supabase.from("levies").select("id, title").eq("community_id", cid).order("id").range(a, b)),
    fetchAll<{ id: string; year: number }>((a, b) => supabase.from("fee_schedules").select("id, year").eq("community_id", cid).order("id").range(a, b)),
  ]);
  const personIds = log.flatMap((r) => [r.actor, r.new_data?.approver_id, r.new_data?.recorded_by, r.new_data?.created_by])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const people = await communityNames(supabase, cid, personIds);

  const lookups: Lookups = {
    currency: s.community.currency,
    units: pick(units.rows, (r) => ({ id: r.id, name: r.label })),
    suppliers: pick(suppliers.rows, (r) => ({ id: r.id, name: r.name })),
    categories: pick(categories.rows, (r) => ({ id: r.id, name: r.name })),
    invoices: pick(invoices.rows, (r) => ({ id: r.id, name: r.invoice_number })),
    contracts: pick(contracts.rows, (r) => ({ id: r.id, name: r.title })),
    budgets: pick(budgets.rows, (r) => ({ id: r.id, name: r.name })),
    levies: pick(levies.rows, (r) => ({ id: r.id, name: r.title })),
    schedules: pick(schedules.rows, (r) => ({ id: r.id, name: `Fees ${r.year}` })),
    people,
  };

  const rows = log.map((r) => ({
    id: r.id,
    day: dateInZone(r.at, tz),
    time: `at ${timeInZone(r.at, tz)}`,
    area: areaLabel(r.table_name),
    action: actionLabel(r.action),
    record: recordLabel(r.table_name, r.record_id, r.new_data ?? r.old_data, lookups),
    who: r.actor ? people.get(r.actor) ?? "Committee member" : "System",
    changed: whatChanged(r.table_name, r.action, r.old_data, r.new_data, lookups),
  }));

  const columns: Column[] = [
    { key: "day", header: "When", type: "date", subKey: "time", primary: true },
    { key: "area", header: "Area", filter: true },
    { key: "action", header: "Action", filter: true },
    { key: "record", header: "Record" },
    { key: "who", header: "Who", filter: true },
    { key: "changed", header: "What changed" },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        intro="Every change to financial records is recorded here and cannot be edited or deleted."
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-4">
        {logRes.error && <Notice tone="bad">The audit log could not be loaded. Please refresh the page.</Notice>}
        <Card className="flex flex-col gap-2">
          <p>
            Showing the <strong>latest {rows.length.toLocaleString("en-GB")}</strong> of {totalCount.toLocaleString("en-GB")} recorded
            {totalCount === 1 ? " change" : " changes"}, newest first. The list is limited to the latest {LIMIT.toLocaleString("en-GB")} changes.
          </p>
          <p className="text-muted">
            “System” means the change was not made by a signed-in person, for example when records were loaded in bulk
            or by an automatic job. Changes that follow from another change (such as a payment paying off a fee) show the
            person who made the first change.
          </p>
        </Card>
        <DataTable
          rows={rows}
          columns={columns}
          currency={s.community.currency}
          dateKey="day"
          defaultSort={{ key: "day", desc: true }}
          exportName="audit-log"
          searchPlaceholder="Search the audit log…"
          empty="No changes have been recorded yet."
          views={[
            { label: "Owner payments", params: { f_area: "Owner payments" } },
            { label: "Invoices", params: { f_area: "Invoices" } },
            { label: "Deletions", params: { f_action: "Deleted" } },
          ]}
        />
      </div>
    </>
  );
}
