/* Turning audit_log rows into words: record names, field labels, readable values and change summaries. */
import { attachmentName } from "./invoice";

export type AuditRow = {
  id: number; at: string; table_name: string; record_id: string | null; action: string; actor: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};

export type Lookups = {
  people: Map<string, string>;
  suppliers: Map<string, string>;
  categories: Map<string, string>;
  contracts: Map<string, string>;
  invoices: Map<string, string>;
  units: Map<string, string>;
  budgets: Map<string, string>;
  levies: Map<string, string>;
};

export const AREA_LABELS: Record<string, string> = {
  invoices: "Invoices", invoice_approvals: "Approvals", suppliers: "Suppliers", contracts: "Contracts",
  budgets: "Budgets", budget_lines: "Budget lines", quotes: "Quotes", ledger_entries: "Bank ledger",
  fee_schedules: "Fee schedules", levies: "Levies", fee_charges: "Owner fees", fee_payments: "Fee payments",
};

const THING: Record<string, string> = {
  invoices: "invoice", invoice_approvals: "approval", suppliers: "supplier", contracts: "contract", budgets: "budget",
  budget_lines: "budget line", quotes: "quote", ledger_entries: "bank entry", fee_schedules: "fee schedule",
  levies: "levy", fee_charges: "owner fee", fee_payments: "fee payment",
};

export const ACTION_LABELS: Record<string, string> = { insert: "Added", update: "Changed", delete: "Deleted" };

const FIELD_LABELS: Record<string, string> = {
  supplier_id: "Supplier", category_id: "Category", contract_id: "Contract", invoice_id: "Invoice", unit_id: "Flat",
  budget_id: "Budget", schedule_id: "Fee schedule", levy_id: "Levy", approver_id: "Approved by", created_by: "Added by",
  recorded_by: "Recorded by", invoice_number: "Invoice number", issue_date: "Invoice date", due_date: "Due date",
  paid_date: "Paid on", net_cents: "Net amount", vat_cents: "VAT", total_cents: "Total", amount_cents: "Amount",
  paid_cents: "Paid so far", unallocated_cents: "Credit left over", annual_total_cents: "Yearly total",
  fixed_amount_cents: "Fixed amount", file_path: "File", notes: "Notes", dispute_reason: "Dispute reason",
  service_type: "Service", tax_id: "Tax ID", contact_name: "Contact", iban: "IBAN", vat_rate: "VAT rate",
  notice_period_days: "Notice period", auto_renew: "Renews automatically", billing_frequency: "Billing",
  price_review_clause: "Price review", start_date: "Start date", end_date: "End date", approved_at: "Approved on",
  created_at: "Created", entry_date: "Date", job_title: "Job", supplier_name: "Supplier name", valid_until: "Valid until",
  period_label: "Period", paid_on: "Paid on", sent_at: "Sent", amount: "Amount",
};

/** Columns that are never interesting to a person reading the log. */
const HIDDEN = new Set(["id", "community_id", "total_cents"]);

export function fieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

export function recordLabel(table: string, data: Record<string, unknown> | null, lk: Lookups, currency = "EUR"): string {
  const d = data ?? {};
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency });
  const unit = lk.units.get(str(d.unit_id));
  switch (table) {
    case "invoices": return `Invoice ${str(d.invoice_number)}${lk.suppliers.get(str(d.supplier_id)) ? ` · ${lk.suppliers.get(str(d.supplier_id))}` : ""}`;
    case "invoice_approvals": {
      const n = lk.invoices.get(str(d.invoice_id));
      return n ? `Approval of invoice ${n}` : "Invoice approval";
    }
    case "suppliers": return str(d.name) || "Supplier";
    case "contracts": return str(d.title) || "Contract";
    case "budgets": return str(d.name) || `Budget ${str(d.year)}`;
    case "budget_lines": return `${lk.categories.get(str(d.category_id)) ?? "Category"} budget line`;
    case "quotes": return `Quote: ${str(d.job_title)}${d.supplier_name ? ` · ${str(d.supplier_name)}` : ""}`;
    case "ledger_entries": return str(d.description) || "Bank entry";
    case "fee_schedules": return `Fee schedule ${str(d.year)}`;
    case "levies": return str(d.title) || "Levy";
    case "fee_charges": return `${unit ? `Flat ${unit}` : "Flat"} · ${str(d.period_label)}`;
    case "fee_payments": return `${unit ? `Flat ${unit}` : "Flat"} · payment of ${fmt.format(Number(d.amount_cents ?? 0) / 100)}`;
    default: return AREA_LABELS[table] ?? table;
  }
}

/** Where the record lives in the app, if it has a page. */
export function recordHref(table: string, data: Record<string, unknown> | null, financeBase: string) {
  const d = data ?? {};
  switch (table) {
    case "invoices": return d.id ? `${financeBase}/invoices/${d.id}` : null;
    case "invoice_approvals": return d.invoice_id ? `${financeBase}/invoices/${d.invoice_id}` : null;
    case "suppliers": return d.id ? `${financeBase}/suppliers/${d.id}` : null;
    case "contracts": return d.id ? `${financeBase}/contracts/${d.id}` : null;
    default: return null;
  }
}

const DATE_KEYS = /(_date|_until|_on)$/;
const TIME_KEYS = /(_at)$/;

export function formatValue(key: string, value: unknown, lk: Lookups, currency = "EUR", timeZone = "Europe/Madrid"): string {
  if (value == null || value === "") return "—";
  if (key.endsWith("_cents")) return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value) / 100);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  const v = String(value);
  switch (key) {
    case "supplier_id": return lk.suppliers.get(v) ?? "A removed supplier";
    case "category_id": return lk.categories.get(v) ?? "A removed category";
    case "contract_id": return lk.contracts.get(v) ?? "A removed contract";
    case "invoice_id": return lk.invoices.get(v) ? `Invoice ${lk.invoices.get(v)}` : "A removed invoice";
    case "unit_id": return lk.units.get(v) ? `Flat ${lk.units.get(v)}` : "A removed flat";
    case "budget_id": return lk.budgets.get(v) ?? "A removed budget";
    case "levy_id": return lk.levies.get(v) ?? "A removed levy";
    case "approver_id": case "created_by": case "recorded_by": case "profile_id": return lk.people.get(v) ?? "Former member";
    case "iban": return v.length > 4 ? `•••• ${v.replace(/\s/g, "").slice(-4)}` : "••••";
    case "file_path": return attachmentName(v) || "File";
    case "vat_rate": return `${Number(v)} %`;
    case "notice_period_days": return `${v} days`;
    case "status": case "billing_frequency": case "method": case "source": case "channel":
      return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  if (DATE_KEYS.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  if (TIME_KEYS.test(key) && !Number.isNaN(Date.parse(v))) {
    return new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
  }
  return v;
}

/** Visible fields of a record, in a stable, readable order. */
export function visibleKeys(...records: (Record<string, unknown> | null)[]) {
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(r ?? {})) if (!HIDDEN.has(k)) keys.add(k);
  return [...keys];
}

export function changedKeys(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  return visibleKeys(oldData, newData).filter((k) => JSON.stringify(oldData?.[k] ?? null) !== JSON.stringify(newData?.[k] ?? null));
}

/** One line describing a change, e.g. "Status changed from Received to Approved". */
export function summarise(row: AuditRow, lk: Lookups, currency = "EUR"): string {
  const thing = THING[row.table_name] ?? "record";
  if (row.table_name === "invoice_approvals") {
    if (row.action === "insert") return "Approved the invoice";
    if (row.action === "delete") return "Approval cleared";
  }
  if (row.action === "insert") return `Added the ${thing}`;
  if (row.action === "delete") return `Deleted the ${thing}`;
  const changed = changedKeys(row.old_data, row.new_data);
  const status = changed.includes("status");
  if (row.table_name === "invoices" && status) {
    const to = str(row.new_data?.status);
    if (to === "paid") return `Marked as paid on ${formatValue("paid_date", row.new_data?.paid_date, lk, currency)}`;
    if (to === "disputed") return "Disputed the invoice";
    if (to === "approved" && row.old_data?.status === "received") return "Invoice fully approved";
    if (row.old_data?.status === "disputed") return "Reopened the dispute";
    if (to === "received") return "Sent back for approval";
  }
  if (status) return `Status changed to ${formatValue("status", row.new_data?.status, lk, currency)}`;
  if (!changed.length) return `Saved the ${thing} without changes`;
  const names = changed.map((k) => fieldLabel(k).toLowerCase());
  return `Changed ${names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(names.length === 2 ? " and " : ", ")}`;
}

/** "12 Oct 2026, 14:05" in the community's time zone. */
export function shortDateTime(at: string, timeZone = "Europe/Madrid") {
  return new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
}
