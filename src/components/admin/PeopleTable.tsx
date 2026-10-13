"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable, { type Column } from "@/components/DataTable";

export type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  flats: string;
  status: string;
  /** For filtering only. */
  roleKeys: string[];
  blocks: string[];
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrators" },
  { value: "treasurer", label: "Treasurers" },
  { value: "owner", label: "Owners" },
  { value: "tenant", label: "Tenants" },
];
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  // Same words as the status badges in the table.
  { value: "pending", label: "Pending" },
  { value: "ended", label: "Ended" },
];

/**
 * Everyone in the community. Role and block are filtered here (a person can hold several roles and
 * have flats in more than one block); search, sort, paging and export come from DataTable.
 */
export default function PeopleTable({ rows, blocks, slug }: { rows: PersonRow[]; blocks: string[]; slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const role = params.get("role") ?? "";
  const block = params.get("block") ?? "";
  const status = params.get("status") ?? "";

  // Phone numbers keep their spaces but never wrap across lines, and are a tap-to-call link
  // (so the office can ring a resident straight from the list, e.g. about a leak).
  const shown = useMemo(() => rows
    .filter((r) => (!role || r.roleKeys.includes(role)) && (!block || r.blocks.includes(block)) && (!status || r.status === status))
    .map((r) => ({
      ...r,
      phone: r.phone ? r.phone.replace(/ /g, "\u00a0") : null,
      tel: r.phone ? r.phone.replace(/[^\d+]/g, "") : null,
    })), [rows, role, block, status]);

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  const columns: Column[] = [
    { key: "name", header: "Name", href: `/${slug}/admin/people/{id}` },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone", href: "tel:{tel}" },
    { key: "roles", header: "Roles", type: "tags" },
    { key: "flats", header: "Flats" },
    { key: "status", header: "Status", type: "status" },
  ];

  // Same counting as the Administration overview ("Members" = active accounts), with the rest named.
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const pending = count("pending");
  const ended = count("ended");
  const extra = [
    pending ? { status: "pending", text: `${pending} waiting for approval` } : null,
    ended ? { status: "ended", text: `${ended} no longer active` } : null,
  ].filter((x): x is { status: string; text: string } => !!x);

  const selects = [
    { key: "role", label: "Role", value: role, options: ROLE_OPTIONS },
    { key: "block", label: "Block", value: block, options: blocks.map((b) => ({ value: b, label: b })) },
    { key: "status", label: "Status", value: status, options: STATUS_OPTIONS },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-muted">
        {rows.length} {rows.length === 1 ? "person" : "people"}: {count("active")} with an active account
        {extra.map((x, i) => (
          <span key={x.status}>
            {i === extra.length - 1 ? " and " : ", "}
            <button type="button" onClick={() => set("status", x.status)}
              className="font-medium text-brand-text underline-offset-4 hover:underline">{x.text}</button>
          </span>
        ))}.
      </p>
      <div className="no-print grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Filter people">
        {selects.map((f) => (
          <div key={f.key} className="field min-w-0">
            <label htmlFor={`people-${f.key}`} className="!text-sm !text-muted">{f.label}</label>
            <select id={`people-${f.key}`} className="input truncate" value={f.value} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      <DataTable
        rows={shown}
        columns={columns}
        defaultSort={{ key: "name" }}
        exportName="people"
        searchPlaceholder="Search by name, email, phone or flat…"
        empty={rows.length ? "Nobody matches these filters." : "Nobody has been added yet. Use “Invite someone” to add the first resident."}
      />
    </div>
  );
}
