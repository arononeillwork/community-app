import { date, humanize, money } from "@/lib/format";

/** Plain-language descriptions of audit_log rows. Pure functions; the page passes in the lookups. */

export type Lookups = {
  currency: string;
  units: Map<string, string>;
  suppliers: Map<string, string>;
  categories: Map<string, string>;
  invoices: Map<string, string>;
  contracts: Map<string, string>;
  budgets: Map<string, string>;
  levies: Map<string, string>;
  schedules: Map<string, string>;
  people: Map<string, string>;
};

type Data = Record<string, unknown> | null;

const AREAS: Record<string, string> = {
  suppliers: "Suppliers",
  contracts: "Contracts",
  invoices: "Invoices",
  invoice_approvals: "Invoice approvals",
  budgets: "Budgets",
  budget_lines: "Budget lines",
  ledger_entries: "Bank ledger",
  fee_schedules: "Fee schedules",
  levies: "Levies",
  fee_charges: "Owner fee charges",
  fee_payments: "Owner payments",
  fee_reminders: "Fee reminders",
  quotes: "Quotes",
  expense_categories: "Expense categories",
};

export function areaLabel(table: string) {
  return AREAS[table] ?? humanize(table);
}

export function actionLabel(action: string) {
  return action === "insert" ? "Created" : action === "update" ? "Changed" : action === "delete" ? "Deleted" : humanize(action);
}

const KEY_LABELS: Record<string, string> = {
  amount_cents: "Amount", paid_cents: "Paid", net_cents: "Net amount", vat_cents: "VAT", total_cents: "Total",
  unallocated_cents: "Credit", annual_total_cents: "Yearly total", fixed_amount_cents: "Fixed amount",
  status: "Status", due_date: "Due date", paid_date: "Paid on", paid_on: "Paid on", issue_date: "Issue date",
  invoice_number: "Invoice number", supplier_id: "Supplier", category_id: "Category", contract_id: "Contract",
  unit_id: "Flat", invoice_id: "Invoice", budget_id: "Budget", schedule_id: "Fee schedule", levy_id: "Levy",
  recorded_by: "Recorded by", created_by: "Created by", approver_id: "Approved by", file_path: "File", notes: "Notes",
  title: "Title", name: "Name", period_label: "Period", method: "Method", frequency: "How often",
  billing_frequency: "Billing", vat_rate: "VAT rate", notice_period_days: "Notice period (days)", auto_renew: "Renews automatically",
  start_date: "Start date", end_date: "End date", chosen: "Chosen", valid_until: "Valid until", job_title: "Job",
  supplier_name: "Supplier", active: "Active", iban: "IBAN", tax_id: "Tax ID", contact_name: "Contact person",
  service_type: "Service", description: "Description", entry_date: "Date", reference: "Reference", source: "Source",
  approved_at: "Approved on", year: "Year", price_review_clause: "Price review clause", email: "Email", phone: "Phone",
  website: "Website", address: "Address",
};

const ENUM_KEYS = new Set(["status", "method", "frequency", "billing_frequency", "source"]);
const PERSON_KEYS = new Set(["recorded_by", "created_by", "approver_id"]);

function keyLabel(k: string) {
  return KEY_LABELS[k] ?? humanize(k.replace(/_(cents|id)$/, ""));
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function short(s: string, n = 60) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function lookupId(k: string, v: string, l: Lookups) {
  const map: Record<string, Map<string, string>> = {
    unit_id: l.units, supplier_id: l.suppliers, category_id: l.categories, invoice_id: l.invoices,
    contract_id: l.contracts, budget_id: l.budgets, levy_id: l.levies, schedule_id: l.schedules,
  };
  if (PERSON_KEYS.has(k)) return l.people.get(v) ?? "a committee member";
  const hit = map[k]?.get(v);
  if (hit) return k === "unit_id" ? `flat ${hit}` : hit;
  return "another record";
}

export function formatValue(k: string, v: unknown, l: Lookups): string {
  if (v == null || v === "") return "empty";
  if (k.endsWith("_cents")) return money(Number(v), l.currency);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (k === "file_path") return "a file";
  if (k.endsWith("_id") || PERSON_KEYS.has(k)) return lookupId(k, String(v), l);
  if (k === "vat_rate") return `${Number(v)}%`;
  if (k === "iban") return `account ending ${String(v).replace(/\s/g, "").slice(-4)}`;
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return date(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return date(v.slice(0, 10));
    if (ENUM_KEYS.has(k)) return humanize(v).toLowerCase();
    return `“${short(v)}”`;
  }
  if (typeof v === "number") return v.toLocaleString("en-GB");
  return short(JSON.stringify(v));
}

/** Short identity of the record ("Invoice F-2026-014 · Limpiezas Sol", "Flat A-2B · 2026 Q3"). */
export function recordLabel(table: string, recordId: string | null, d: Data, l: Lookups): string {
  const g = (k: string) => str(d?.[k]);
  const unit = l.units.get(g("unit_id"));
  switch (table) {
    case "invoices": return [`Invoice ${g("invoice_number")}`.trim(), l.suppliers.get(g("supplier_id"))].filter(Boolean).join(" · ");
    case "invoice_approvals": return `Invoice ${l.invoices.get(g("invoice_id")) ?? ""}`.trim();
    case "suppliers": return g("name") || "Supplier";
    case "contracts": return g("title") || "Contract";
    case "budgets": return g("name") || `Budget ${g("year")}`;
    case "budget_lines": return [l.budgets.get(g("budget_id")), l.categories.get(g("category_id"))].filter(Boolean).join(" · ") || "Budget line";
    case "ledger_entries": return short(g("description"), 50) || "Ledger entry";
    case "fee_schedules": return `Fees ${g("year")}`.trim();
    case "levies": return g("title") || "Levy";
    case "fee_charges": return [unit ? `Flat ${unit}` : null, g("period_label")].filter(Boolean).join(" · ") || "Fee charge";
    case "fee_payments": return unit ? `Payment · flat ${unit}` : "Payment";
    case "quotes": return g("job_title") || "Quote";
    default: return recordId ? `Record ${recordId.slice(0, 8)}` : "—";
  }
}

/** One-line summary of a new (or deleted) record. */
function summary(table: string, d: Data, l: Lookups): string {
  const g = (k: string) => str(d?.[k]);
  const m = (k: string) => money(Number(d?.[k] ?? 0), l.currency);
  switch (table) {
    case "invoices": {
      const total = d?.total_cents != null ? m("total_cents") : money(Number(d?.net_cents ?? 0) + Number(d?.vat_cents ?? 0), l.currency);
      return `Invoice ${g("invoice_number")} from ${l.suppliers.get(g("supplier_id")) ?? "a supplier"}: ${total}, ${humanize(g("status")).toLowerCase() || "received"}`;
    }
    case "invoice_approvals":
      return `Invoice ${l.invoices.get(g("invoice_id")) ?? ""} approved by ${l.people.get(g("approver_id")) ?? "a committee member"}`.replace("  ", " ");
    case "suppliers": return `Supplier ${g("name")}${g("service_type") ? ` (${g("service_type")})` : ""}`;
    case "contracts": return `Contract “${short(g("title"), 50)}”: ${m("amount_cents")} ${humanize(g("billing_frequency")).toLowerCase()}`;
    case "budgets": return `Budget “${g("name")}” for ${g("year")}`;
    case "budget_lines": return `${l.categories.get(g("category_id")) ?? "Budget line"}: ${m("amount_cents")}`;
    case "ledger_entries": return `${short(g("description"), 50)}: ${m("amount_cents")}`;
    case "fee_schedules":
      return `Fees for ${g("year")}: ${humanize(g("frequency")).toLowerCase()}, ${g("method") === "fixed" ? `${m("fixed_amount_cents")} per flat` : `${m("annual_total_cents")} for the year`}`;
    case "levies": return `Levy “${g("title")}”: ${m("total_cents")}, due ${date(g("due_date"))}`;
    case "fee_charges": return `${g("period_label")}: ${m("amount_cents")}, due ${date(g("due_date"))}`;
    case "fee_payments": return `Payment of ${m("amount_cents")} on ${date(g("paid_on"))} (${humanize(g("method")).toLowerCase()})`;
    case "quotes": return `Quote for “${short(g("job_title"), 50)}”: ${m("amount_cents")}`;
    default: return "New record";
  }
}

/** "What changed": differences for updates, a summary for inserts and deletes. */
export function whatChanged(table: string, action: string, oldData: Data, newData: Data, l: Lookups): string {
  if (action === "insert") return summary(table, newData, l);
  if (action === "delete") return `Removed: ${summary(table, oldData, l)}`;
  const keys = Array.from(new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]));
  const changes = keys
    .filter((k) => k !== "id" && k !== "community_id" && k !== "created_at")
    .filter((k) => JSON.stringify(oldData?.[k] ?? null) !== JSON.stringify(newData?.[k] ?? null))
    .map((k) => `${keyLabel(k)}: ${formatValue(k, oldData?.[k], l)} → ${formatValue(k, newData?.[k], l)}`);
  if (changes.length === 0) {
    // The payment trigger re-saves each new payment after sharing it out to unpaid fees.
    return table === "fee_payments" ? "Shared out to unpaid fees; no credit left over" : "Saved again, nothing changed";
  }
  return changes.length > 6 ? `${changes.slice(0, 6).join("; ")}; and ${changes.length - 6} more` : changes.join("; ");
}
