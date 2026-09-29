/**
 * Bank statement CSV parsing and flat matching (pure functions, no database access).
 *
 * Accepted input: columns date, description, amount (in that order, or named in a header row).
 * Separator ";" or "," (or tab) is detected automatically. Amounts like "1.234,56", "1234.56" or "€ 850".
 * Dates as YYYY-MM-DD or DD/MM/YYYY (also DD-MM-YYYY and DD.MM.YYYY).
 */
import { parseEurosToCents } from "@/lib/format";
import { foldText, isIsoDate, surnameOf } from "./utils";

export type StatementLine = {
  /** Line number in the file (1-based), shown to the user as "Row". */
  line: number;
  date: string | null;
  rawDate: string;
  description: string;
  amount_cents: number | null;
  rawAmount: string;
};

export type ParseResult = { lines: StatementLine[]; separator: string; hadHeader: boolean };

/** Split CSV text into rows of fields, honouring "quoted, fields" and "" escapes. */
function splitCsv(text: string, sep: string): { fields: string[]; line: number }[] {
  const out: { fields: string[]; line: number }[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") { field = ""; inQuotes = true; continue; }
    if (ch === sep) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      out.push({ fields: row, line: rowStart });
      row = []; field = ""; line++; rowStart = line;
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); out.push({ fields: row, line: rowStart }); }
  return out
    .map((r) => ({ ...r, fields: r.fields.map((f) => f.trim()) }))
    .filter((r) => r.fields.some((f) => f !== ""));
}

function countOutsideQuotes(s: string, ch: string) {
  let n = 0;
  let q = false;
  for (const c of s) {
    if (c === '"') q = !q;
    else if (c === ch && !q) n++;
  }
  return n;
}

function detectSeparator(text: string) {
  const firstLines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 5);
  const score = (ch: string) => firstLines.reduce((s, l) => s + Math.min(countOutsideQuotes(l, ch), 10), 0);
  const semi = score(";");
  const tab = score("\t");
  // Semicolons win when present on the lines: a comma is then almost certainly a decimal comma.
  if (semi >= firstLines.length && semi >= tab) return ";";
  if (tab >= firstLines.length) return "\t";
  return ",";
}

/** "2026-10-03", "03/10/2026", "3-10-2026", "03.10.2026" -> "2026-10-03"; null if not a real date. */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

/** "1.234,56", "1234.56", "-12,50", "€ 850", "850 EUR" -> cents; null when it is not a plain amount. */
export function parseStatementAmount(raw: string): number | null {
  const s = raw.replace(/eur(os)?/gi, "").replace(/€/g, "").trim();
  if (!/^[+-]?[\d.,\s]*\d[\d.,\s]*$/.test(s)) return null;
  return parseEurosToCents(s);
}

const HEADER_NAMES: Record<"date" | "description" | "amount", string[]> = {
  date: ["date", "fecha", "booking date", "fecha operacion", "fecha valor", "value date", "datum"],
  description: ["description", "descripcion", "concepto", "concept", "details", "reference", "referencia", "text", "memo", "payee"],
  amount: ["amount", "importe", "cantidad", "value", "amount eur", "importe eur", "betrag"],
};

function headerIndex(headers: string[], kind: keyof typeof HEADER_NAMES) {
  const norm = headers.map((h) => foldText(h).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim());
  for (const name of HEADER_NAMES[kind]) {
    const i = norm.indexOf(name);
    if (i >= 0) return i;
  }
  return norm.findIndex((h) => HEADER_NAMES[kind].some((n) => h.startsWith(n)));
}

/** Parse the whole file. Never throws; lines it cannot read keep date/amount null. */
export function parseStatementCsv(input: string): ParseResult {
  const text = input.replace(/^﻿/, "");
  const separator = detectSeparator(text);
  const rows = splitCsv(text, separator);
  if (rows.length === 0) return { lines: [], separator, hadHeader: false };

  // Header row: the first row has no readable date and no readable amount.
  const first = rows[0].fields;
  const hadHeader = !first.some((f) => parseStatementDate(f)) && !first.slice(1).some((f) => parseStatementAmount(f) != null);
  let idx = { date: 0, description: 1, amount: 2 };
  let named = false;
  if (hadHeader) {
    const d = headerIndex(first, "date");
    const t = headerIndex(first, "description");
    const a = headerIndex(first, "amount");
    if (d >= 0 && t >= 0 && a >= 0 && new Set([d, t, a]).size === 3) { idx = { date: d, description: t, amount: a }; named = true; }
  }

  // A named header in the plain "date, description, amount" order behaves like no header for extra fields.
  const plainOrder = !named || (first.length === 3 && idx.date === 0 && idx.description === 1 && idx.amount === 2);

  const lines: StatementLine[] = [];
  for (const r of hadHeader ? rows.slice(1) : rows) {
    let f = r.fields;
    let rawDate: string, description: string, rawAmount: string;
    if (named && !plainOrder && f.length > first.length) {
      // More fields than the header has: an unquoted separator inside a value. Reading on would risk
      // taking the wrong number as the amount, so this row is shown as unreadable instead.
      lines.push({ line: r.line, rawDate: f[idx.date] ?? "", date: parseStatementDate(f[idx.date] ?? ""), description: f.join(" ").slice(0, 300), rawAmount: "", amount_cents: null });
      continue;
    }
    if ((named && !plainOrder) || f.length <= 3) {
      rawDate = f[idx.date] ?? "";
      description = f[idx.description] ?? "";
      rawAmount = f[idx.amount] ?? "";
    } else {
      // More fields than expected without a header: date first, amount last, the rest is the description.
      // Repair an unquoted "1,234.56" that the comma separator split into "1" and "234.56".
      if (separator === "," && f.length > 3 && /^-?\d{1,3}$/.test(f[f.length - 2]) && /^\d{3}(\.\d{1,2})?$/.test(f[f.length - 1])) {
        f = [...f.slice(0, -2), `${f[f.length - 2]}${f[f.length - 1]}`];
      }
      rawDate = f[0] ?? "";
      rawAmount = f[f.length - 1] ?? "";
      description = f.slice(1, -1).join(separator === "\t" ? " " : `${separator} `);
    }
    lines.push({
      line: r.line,
      rawDate,
      date: parseStatementDate(rawDate),
      description: description.replace(/\s+/g, " ").trim().slice(0, 300),
      rawAmount,
      amount_cents: parseStatementAmount(rawAmount),
    });
  }
  return { lines, separator, hadHeader };
}

// ---------------------------------------------------------------------------
// Matching a description to a flat
// ---------------------------------------------------------------------------
export type MatchUnit = { id: string; label: string; ownerNames: string[] };

export type MatchResult =
  | { unitId: string; reason: string; candidates: string[] }
  | { unitId: null; reason: string | null; candidates: string[] };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pattern for a flat label that tolerates spaces, dashes or nothing between its parts:
 * "A-2B" matches "A-2B", "A 2B", "A2B", "a-2-b". It must not touch other letters or digits.
 */
export function labelPattern(label: string): RegExp | null {
  const tokens = foldText(label).match(/[A-Z]+|[0-9]+/g);
  if (!tokens || tokens.join("").length < 2) return null;
  const body = tokens.map(escapeRe).join("[\\s\\-_./]*");
  return new RegExp(`(?:^|[^A-Z0-9])${body}(?=[^A-Z0-9]|$)`);
}

export function buildMatcher(units: MatchUnit[]) {
  const labelRes = units.map((u) => ({ id: u.id, re: labelPattern(u.label) }));
  const surnames = new Map<string, Set<string>>();
  for (const u of units) {
    for (const n of u.ownerNames) {
      const s = surnameOf(n);
      if (!s) continue;
      if (!surnames.has(s)) surnames.set(s, new Set());
      surnames.get(s)!.add(u.id);
    }
  }
  const surnameRes = Array.from(surnames.entries()).map(([s, ids]) => ({
    surname: s, ids: Array.from(ids), re: new RegExp(`(?:^|[^A-Z0-9])${escapeRe(s)}(?=[^A-Z0-9]|$)`),
  }));

  return function match(description: string): MatchResult {
    const text = foldText(description);
    const byLabel = labelRes.filter((l) => l.re && l.re.test(text)).map((l) => l.id);
    if (byLabel.length === 1) return { unitId: byLabel[0], reason: "Flat number in the description", candidates: [] };
    if (byLabel.length > 1) return { unitId: null, reason: "Mentions more than one flat", candidates: byLabel };

    const hits = surnameRes.filter((s) => s.re.test(text));
    const ids = Array.from(new Set(hits.flatMap((h) => h.ids)));
    const who = hits.map((h) => h.surname.charAt(0) + h.surname.slice(1).toLowerCase()).join(", ");
    if (ids.length === 1) return { unitId: ids[0], reason: `Owner's surname (${who})`, candidates: [] };
    if (ids.length > 1) return { unitId: null, reason: `${who} owns more than one flat`, candidates: ids };
    return { unitId: null, reason: null, candidates: [] };
  };
}

/** Key used to spot a bank line that was already recorded as a payment. */
export function paymentKey(paidOn: string, amountCents: number, reference: string | null | undefined) {
  return `${paidOn}|${amountCents}|${(reference ?? "").replace(/\s+/g, " ").trim().toLowerCase()}`;
}
