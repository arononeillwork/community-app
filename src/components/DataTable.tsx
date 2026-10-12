"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import {
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState, type FilterFn,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Printer, Search, X } from "lucide-react";
import { STATUS_LABELS, STATUS_TONES, Badge } from "@/components/ui";

/**
 * One table used everywhere. Column definitions are plain data (so Server Components can pass them).
 * State (search, sort, filters, date range, page size) lives in the URL, so views can be bookmarked.
 */
export type Column = {
  key: string;
  header: string;
  type?: "text" | "money" | "date" | "number" | "status" | "tags" | "percent";
  /** Show a dropdown filter with the distinct values of this column. */
  filter?: boolean;
  /** Add a totals row entry (money/number). */
  total?: boolean;
  /** Link cell to this href; "{id}" etc. are replaced with row values. */
  href?: string;
  /** Show in the phone card title. */
  primary?: boolean;
  /** Hide on the phone card. */
  mobileHidden?: boolean;
  /** Secondary line under the value (key of another field). */
  subKey?: string;
  /** CSV header for the secondary line; when set, the export gets its own column for it. */
  subHeader?: string;
  /** Keep the value on one line (phone numbers, invoice numbers). */
  nowrap?: boolean;
  /** Not shown on screen, but searched and exported. */
  hidden?: boolean;
};

export type SavedView = { label: string; params: Record<string, string> };

type Row = Record<string, unknown>;

type Props = {
  rows: Row[];
  columns: Column[];
  /** Column used for the date-range filter. */
  dateKey?: string;
  currency?: string;
  searchPlaceholder?: string;
  defaultSort?: { key: string; desc?: boolean };
  views?: SavedView[];
  exportName?: string;
  empty?: string;
  /** Distinguish multiple tables on one page. */
  id?: string;
};

const RANGES: { value: string; label: string }[] = [
  { value: "", label: "Any date" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "12m", label: "Last 12 months" },
  { value: "lastyear", label: "Last year" },
  { value: "future", label: "Upcoming" },
];

function inRange(value: unknown, range: string) {
  if (!range) return true;
  if (!value) return false;
  const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : String(value));
  const now = new Date();
  switch (range) {
    case "month": return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    case "year": return d.getFullYear() === now.getFullYear();
    case "lastyear": return d.getFullYear() === now.getFullYear() - 1;
    case "12m": { const from = new Date(now); from.setFullYear(now.getFullYear() - 1); return d >= from && d <= now; }
    case "future": return d >= new Date(now.toDateString());
    default: return true;
  }
}

function label(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  return STATUS_LABELS[s] ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function DataTable({
  rows, columns, dateKey, currency = "EUR", searchPlaceholder = "Search…", defaultSort, views = [],
  exportName = "export", empty = "Nothing to show yet.", id = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const p = (k: string) => params.get(id + k) ?? "";

  const [search, setSearch] = useState(p("q"));
  const sortKey = p("sort") || defaultSort?.key || "";
  const sortDesc = p("sort") ? p("dir") === "desc" : !!defaultSort?.desc;
  const range = p("range");
  const pageSize = Number(p("size")) || 25;
  const page = Math.max(0, (Number(p("page")) || 1) - 1);
  const filterCols = columns.filter((c) => c.filter);
  const active: Record<string, string> = Object.fromEntries(filterCols.map((c) => [c.key, p(`f_${c.key}`)]).filter(([, v]) => v));

  const fmtMoney = useMemo(() => new Intl.NumberFormat("en-GB", { style: "currency", currency }), [currency]);
  const fmtDate = (v: unknown) => {
    if (!v) return "—";
    const s = String(v);
    return new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") sp.delete(id + k); else sp.set(id + k, v);
    }
    if (!("page" in next)) sp.delete(id + "page");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  // Pre-filter by dropdowns and date range; TanStack handles search, sort and paging.
  const filtered = useMemo(
    () => rows.filter((r) => Object.entries(active).every(([k, v]) => String(r[k] ?? "") === v) && (!dateKey || inRange(r[dateKey], range))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, JSON.stringify(active), range, dateKey],
  );

  const globalFilter: FilterFn<Row> = (row, _col, q: string) => {
    const needle = q.toLowerCase();
    return columns.some((c) => String(row.original[c.key] ?? "").toLowerCase().includes(needle));
  };

  const colDefs = useMemo<ColumnDef<Row>[]>(
    () => columns.map((c) => ({
      id: c.key,
      accessorFn: (r) => r[c.key] as unknown,
      header: c.header,
      sortingFn: c.type === "money" || c.type === "number" || c.type === "percent" ? "basic" : c.type === "date" ? "datetime" : "alphanumeric",
      sortUndefined: "last",
    })),
    [columns],
  );

  const sorting: SortingState = sortKey ? [{ id: sortKey, desc: sortDesc }] : [];
  const table = useReactTable({
    data: filtered,
    columns: colDefs,
    state: { sorting, globalFilter: search, pagination: { pageIndex: page, pageSize } },
    globalFilterFn: globalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  const visible = table.getFilteredRowModel().rows; // after search, before paging
  const pageRows = table.getRowModel().rows;
  const pageCount = Math.max(1, table.getPageCount());

  const totals = Object.fromEntries(
    columns.filter((c) => c.total).map((c) => [c.key, visible.reduce((s, r) => s + (Number(r.original[c.key]) || 0), 0)]),
  );

  function renderCell(c: Column, r: Row) {
    const v = r[c.key];
    let out: React.ReactNode;
    switch (c.type) {
      case "money": out = v == null ? "—" : fmtMoney.format(Number(v) / 100); break;
      case "date": out = fmtDate(v); break;
      case "number": out = v == null ? "—" : Number(v).toLocaleString("en-GB"); break;
      case "percent": out = v == null ? "—" : `${Number(v).toFixed(2)} %`; break;
      case "status": out = v ? <Badge tone={STATUS_TONES[String(v)] ?? "neutral"}>{label(v)}</Badge> : "—"; break;
      case "tags": out = Array.isArray(v) ? v.join(", ") : label(v); break;
      default: out = v == null || v === "" ? "—" : String(v);
    }
    if (c.href && v != null) {
      const href = c.href.replace(/\{(\w+)\}/g, (_, k) => String(r[k] ?? ""));
      out = <Link href={href} className="font-medium text-brand-text no-underline underline-offset-4 hover:underline">{out}</Link>;
    }
    if (c.subKey && r[c.subKey]) out = <div>{out}<div className="text-[0.8125rem] text-muted">{String(r[c.subKey])}</div></div>;
    return out;
  }

  const isNum = (c: Column) => c.type === "money" || c.type === "number" || c.type === "percent";
  const shown = columns.filter((c) => !c.hidden);

  function exportCsv() {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cell = (c: Column, v: unknown) => {
      if (c.type === "money") return v == null ? "" : (Number(v) / 100).toFixed(2);
      return esc(Array.isArray(v) ? v.join("; ") : v);
    };
    const lines = [columns.flatMap((c) => (c.subKey && c.subHeader ? [esc(c.header), esc(c.subHeader)] : [esc(c.header)])).join(",")];
    for (const r of table.getSortedRowModel().rows) {
      lines.push(columns.flatMap((c) => {
        const main = cell(c, r.original[c.key]);
        return c.subKey && c.subHeader ? [main, esc(r.original[c.subKey])] : [main];
      }).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const chips = [
    ...Object.entries(active).map(([k, v]) => ({ k: `f_${k}`, text: `${columns.find((c) => c.key === k)?.header}: ${label(v)}` })),
    ...(range ? [{ k: "range", text: RANGES.find((r) => r.value === range)?.label ?? range }] : []),
    ...(search ? [{ k: "q", text: `“${search}”` }] : []),
  ];

  const smallBtn = "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong/60 bg-surface px-3.5 text-[0.9375rem] font-medium text-ink-2 shadow-card transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <div className="flex flex-col gap-4">
      {views.length > 0 && (
        <div className="no-print flex flex-wrap gap-1.5" role="group" aria-label="Saved views">
          {views.map((v) => {
            const on = Object.entries(v.params).every(([k, val]) => p(k) === val) && Object.keys(v.params).length > 0;
            return (
              <button key={v.label} type="button" aria-pressed={on} onClick={() => {
                const reset: Record<string, string | null> = { q: null, range: null, sort: null, dir: null };
                filterCols.forEach((c) => (reset[`f_${c.key}`] = null));
                setSearch(v.params.q ?? "");
                update({ ...reset, ...v.params });
              }}
                className={clsx("min-h-9 rounded-full px-3.5 text-[0.9375rem] font-medium transition-colors",
                  on ? "bg-ink text-surface" : "bg-surface text-ink-2 ring-1 ring-inset ring-line hover:text-ink")}>
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="no-print flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="field min-w-[min(100%,14rem)] flex-1">
          <label htmlFor={`${id}search`} className="!text-sm !text-muted">Search</label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted" />
            <input id={`${id}search`} type="search" className="input pl-10" value={search} placeholder={searchPlaceholder}
              onChange={(e) => { setSearch(e.target.value); update({ q: e.target.value }); }} />
          </div>
        </div>
        {filterCols.map((c) => {
          const values = Array.from(new Set(rows.map((r) => r[c.key]).filter((v) => v != null && v !== "").map(String))).sort();
          return (
            <div key={c.key} className="field min-w-[min(100%,10rem)] flex-1 sm:flex-none">
              <label htmlFor={`${id}f_${c.key}`} className="!text-sm !text-muted">{c.header}</label>
              <select id={`${id}f_${c.key}`} className="input" value={active[c.key] ?? ""} onChange={(e) => update({ [`f_${c.key}`]: e.target.value })}>
                <option value="">All</option>
                {values.map((v) => <option key={v} value={v}>{label(v)}</option>)}
              </select>
            </div>
          );
        })}
        {dateKey && (
          <div className="field min-w-[min(100%,10rem)] flex-1 sm:flex-none">
            <label htmlFor={`${id}range`} className="!text-sm !text-muted">Date</label>
            <select id={`${id}range`} className="input" value={range} onChange={(e) => update({ range: e.target.value })}>
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <button type="button" onClick={exportCsv} className={smallBtn} title="Download the rows shown as a spreadsheet (CSV)">
            <Download aria-hidden className="size-4" /> Export
          </button>
          <button type="button" onClick={() => window.print()} className={smallBtn}>
            <Printer aria-hidden className="size-4" /> Print
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((ch) => (
            <button key={ch.k} type="button" onClick={() => { if (ch.k === "q") setSearch(""); update({ [ch.k]: null }); }}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-sm font-medium text-brand-text hover:brightness-95">
              {ch.text} <X aria-label="Remove filter" className="size-3.5" />
            </button>
          ))}
          <button type="button" className="min-h-8 px-2 text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => {
            const reset: Record<string, null> = { q: null, range: null };
            filterCols.forEach((c) => (reset[`f_${c.key}`] = null));
            setSearch("");
            update(reset);
          }}>Clear all</button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center text-muted">{empty}</div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="card hidden overflow-hidden rounded-card border border-line bg-surface shadow-card md:block">
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface-2">
                  <tr className="border-b border-line">
                    {shown.map((c) => {
                      const on = sortKey === c.key;
                      return (
                        <th key={c.key} scope="col" aria-sort={on ? (sortDesc ? "descending" : "ascending") : "none"}
                          className={clsx("whitespace-nowrap px-4 py-2 text-[0.8125rem] font-medium text-muted", isNum(c) && "text-right")}>
                          <button type="button" onClick={() => update({ sort: c.key, dir: on && !sortDesc ? "desc" : "asc" })}
                            className={clsx("inline-flex min-h-8 items-center gap-1 rounded-md hover:text-ink", on && "text-ink", isNum(c) && "flex-row-reverse")}
                            title={`Sort by ${c.header}`}>
                            {c.header}
                            {on ? (sortDesc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)
                                : <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />}
                            <span className="sr-only">{on ? (sortDesc ? "sorted descending" : "sorted ascending") : ""}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2/70">
                      {shown.map((c) => (
                        <td key={c.key} className={clsx("px-4 py-3 align-top text-[0.9375rem] text-ink-2", c.primary && "min-w-[13rem]", c.nowrap && "whitespace-nowrap", isNum(c) && "tabular whitespace-nowrap text-right", c.type === "date" && "whitespace-nowrap")}>
                          {renderCell(c, row.original)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(totals).length > 0 && (
                  <tfoot>
                    <tr className="border-t border-line bg-surface-2 font-semibold text-ink">
                      {shown.map((c, i) => (
                        <td key={c.key} className={clsx("px-4 py-3 text-[0.9375rem]", isNum(c) && "tabular whitespace-nowrap text-right")}>
                          {c.key in totals ? (c.type === "money" ? fmtMoney.format(totals[c.key] / 100) : totals[c.key].toLocaleString("en-GB"))
                            : i === 0 ? `Total (${visible.length})` : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Phone: stacked cards */}
          <ul className="flex flex-col gap-2.5 md:hidden">
            {pageRows.map((row) => {
              const primary = shown.find((c) => c.primary) ?? shown[0];
              return (
                <li key={row.id} className="card rounded-card border border-line bg-surface p-4 shadow-card">
                  <div className="mb-2 font-medium">{renderCell(primary, row.original)}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.9375rem]">
                    {shown.filter((c) => c !== primary && !c.mobileHidden).map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-muted">{c.header}</dt>
                        <dd className={clsx("min-w-0 text-ink-2", isNum(c) && "tabular")}>{renderCell(c, row.original)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
            {Object.keys(totals).length > 0 && (
              <li className="rounded-card border border-brand-line bg-brand-soft p-4 font-semibold">
                {shown.filter((c) => c.key in totals).map((c) => (
                  <div key={c.key} className="flex justify-between"><span>Total {c.header.toLowerCase()}</span>
                    <span className="tabular">{c.type === "money" ? fmtMoney.format(totals[c.key] / 100) : totals[c.key]}</span></div>
                ))}
              </li>
            )}
          </ul>

          {/* Paging */}
          <div className="no-print flex flex-wrap items-center justify-between gap-3 text-[0.9375rem] text-muted">
            <p aria-live="polite">
              Showing <span className="font-medium text-ink">{pageRows.length}</span> of <span className="font-medium text-ink">{visible.length}</span>
              {visible.length !== rows.length && <> (filtered from {rows.length})</>}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-2">
                <span>Rows</span>
                <select className="input !min-h-10 w-auto !py-1" value={pageSize} onChange={(e) => update({ size: e.target.value })}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={page === 0} onClick={() => update({ page: String(page) })} className={clsx(smallBtn, "disabled:opacity-40")}>
                  ← Previous
                </button>
                <span className="whitespace-nowrap tabular">Page {page + 1} of {pageCount}</span>
                <button type="button" disabled={page + 1 >= pageCount} onClick={() => update({ page: String(page + 2) })} className={clsx(smallBtn, "disabled:opacity-40")}>
                  Next →
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
