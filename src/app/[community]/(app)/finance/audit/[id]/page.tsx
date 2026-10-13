import { notFound } from "next/navigation";
import { ArrowRight, History } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Button, Card, DefinitionList, SectionHeader } from "@/components/ui";
import FinanceHeader from "@/components/finance/FinanceHeader";
import {
  ACTION_LABELS, AREA_LABELS, type AuditRow, changedKeys, fieldLabel, formatValue, recordHref, recordLabel, shortDateTime, summarise, visibleKeys,
} from "@/components/finance/audit";
import { loadLookups } from "@/components/finance/lookups";
import { personName } from "@/components/finance/people";

export const metadata = { title: "Change" };

export default async function AuditEntryPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireFinance(community);
  if (!/^\d{1,18}$/.test(id)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance`;
  const cur = s.community.currency;
  const tz = s.community.timezone;

  const [{ data }, lookups] = await Promise.all([
    supabase.from("audit_log").select("id, at, table_name, record_id, action, actor, old_data, new_data").eq("community_id", c).eq("id", id).maybeSingle(),
    loadLookups(supabase, c),
  ]);
  if (!data) notFound();
  const row = data as AuditRow;
  const record = row.new_data ?? row.old_data;
  const label = recordLabel(row.table_name, record, lookups, cur);
  const href = recordHref(row.table_name, record, base);
  const who = personName(lookups.people, row.actor);
  const fmt = (k: string, v: unknown) => formatValue(k, v, lookups, cur, tz);

  const changed = row.action === "update" ? changedKeys(row.old_data, row.new_data) : [];
  const unchanged = row.action === "update" ? visibleKeys(row.new_data).filter((k) => !changed.includes(k)) : [];
  const snapshot = row.action === "insert" ? row.new_data : row.action === "delete" ? row.old_data : null;

  return (
    <div className="max-w-4xl">
      <FinanceHeader
        back={{ href: `${base}/audit`, label: "Audit log" }}
        title={label}
        intro={`${AREA_LABELS[row.table_name] ?? row.table_name} · ${ACTION_LABELS[row.action] ?? row.action}`}
        actions={href && row.action !== "delete" ? (
          <Button href={href} variant="secondary">Open {row.table_name === "invoice_approvals" ? "invoice" : row.table_name.replace(/s$/, "")} <ArrowRight aria-hidden className="size-4" /></Button>
        ) : undefined}
      />
      <div className="flex flex-col gap-5">
        <Card className="flex items-center gap-3">
          <Avatar name={who} />
          <div className="min-w-0">
            <div className="font-medium">{summarise(row, lookups, cur)}</div>
            <div className="text-[0.9375rem] text-muted">{who} · {shortDateTime(row.at, tz)}</div>
          </div>
        </Card>

        {row.action === "update" && (
          <Card padded={false}>
            <div className="p-5 pb-3 sm:p-6 sm:pb-3">
              <SectionHeader icon={History} title="What changed" className="!mb-0"
                description={changed.length ? `${changed.length} ${changed.length === 1 ? "field" : "fields"}` : "Saved without changes"} />
            </div>
            {changed.length > 0 && (
              <div role="table" aria-label="Changed fields" className="border-t border-line">
                <div role="row" className="hidden grid-cols-[11rem_1fr_1fr] gap-4 bg-surface-2 px-6 py-2 text-[0.8125rem] font-medium text-muted sm:grid">
                  <span role="columnheader">Field</span><span role="columnheader">Before</span><span role="columnheader">After</span>
                </div>
                {changed.map((k) => (
                  <div role="row" key={k} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line px-5 py-3 first:border-t-0 sm:grid-cols-[11rem_1fr_1fr] sm:px-6">
                    <span role="rowheader" className="col-span-2 text-[0.9375rem] font-medium text-ink sm:col-span-1">{fieldLabel(k)}</span>
                    <span role="cell" className="min-w-0 break-words text-[0.9375rem] text-muted">
                      <span className="mr-1 text-xs sm:hidden">Before</span>{fmt(k, row.old_data?.[k])}
                    </span>
                    <span role="cell" className="min-w-0 break-words text-[0.9375rem] text-ink">
                      <span className="mr-1 text-xs text-muted sm:hidden">After</span>{fmt(k, row.new_data?.[k])}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {snapshot && (
          <Card>
            <SectionHeader icon={History} title={row.action === "insert" ? "Details when added" : "Details before it was deleted"} />
            <DefinitionList items={visibleKeys(snapshot).map((k) => ({ label: fieldLabel(k), value: <span className="break-words">{fmt(k, snapshot[k])}</span> }))} />
          </Card>
        )}

        {unchanged.length > 0 && (
          <details className="group rounded-card border border-line bg-surface shadow-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium sm:px-6">
              Other details at the time
              <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <DefinitionList items={unchanged.map((k) => ({ label: fieldLabel(k), value: <span className="break-words">{fmt(k, row.new_data?.[k])}</span> }))} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
