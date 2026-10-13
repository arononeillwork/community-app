import type { NextRequest } from "next/server";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { ACTION_LABELS, AREA_LABELS, type AuditRow, recordLabel, summarise } from "@/components/finance/audit";
import { auditQuery, csvCell, parseAuditFilters } from "@/components/finance/audit-query";
import { loadLookups } from "@/components/finance/lookups";
import { personName } from "@/components/finance/people";
import { isoDayOf } from "@/components/finance/dates";

/*
 * Audit log as a spreadsheet (CSV): every change that matches the page's filters, not only the rows on screen.
 * Route handlers do not get the Finance layout, so the finance role is checked here, and the rows are read with the
 * signed-in user's client, so RLS ("finance read audit") applies as well. Rows are read 1,000 at a time and streamed.
 */

const BATCH = 1000;
const HEADER = ["Date", "Time", "Who", "Area", "Action", "Record", "Change", "Log entry", "Record id"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const tz = s.community.timezone;
  const cur = s.community.currency;
  const filters = parseAuditFilters(request.nextUrl.searchParams);

  // Fix the set of rows at the start: entries added while the file is being written (always with a higher id) are left out,
  // so no row is skipped or repeated between batches.
  const [{ data: newest, error: topError }, lookups] = await Promise.all([
    supabase.from("audit_log").select("id").eq("community_id", c).order("id", { ascending: false }).limit(1).maybeSingle(),
    loadLookups(supabase, c),
  ]);
  if (topError) return new Response("The audit log could not be read.", { status: 500, headers: { "Cache-Control": "no-store" } });
  const maxId = Number(newest?.id ?? 0);

  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const line = (r: AuditRow) => [
    isoDayOf(r.at, tz),
    time.format(new Date(r.at)),
    personName(lookups.people, r.actor),
    AREA_LABELS[r.table_name] ?? r.table_name,
    ACTION_LABELS[r.action] ?? r.action,
    recordLabel(r.table_name, r.new_data ?? r.old_data, lookups, cur),
    summarise(r, lookups, cur),
    r.id,
    r.record_id,
  ].map(csvCell).join(",");

  const batch = (from: number) => auditQuery(supabase, c, filters, tz)
    .lte("id", maxId)
    .order("at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + BATCH - 1);

  // The first batch is read before answering, so a failure gives an error instead of a broken file.
  const first = await batch(0);
  if (first.error) return new Response("The audit log could not be read.", { status: 500, headers: { "Cache-Control": "no-store" } });

  const enc = new TextEncoder();
  let next: AuditRow[] | null = (first.data ?? []) as AuditRow[];
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Byte-order mark so spreadsheet apps read accents correctly.
      controller.enqueue(enc.encode(`﻿${HEADER.map(csvCell).join(",")}\r\n`));
    },
    async pull(controller) {
      let rows = next;
      next = null;
      if (!rows) {
        const res = await batch(offset);
        if (res.error) { controller.error(new Error("The audit log could not be read.")); return; }
        rows = (res.data ?? []) as AuditRow[];
      }
      if (rows.length) controller.enqueue(enc.encode(rows.map(line).join("\r\n") + "\r\n"));
      offset += rows.length;
      if (rows.length < BATCH) controller.close();
    },
  });

  const name = `audit-log-${todayInput(tz)}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
