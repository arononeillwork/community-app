import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { todayInput } from "@/lib/format";
import { fetchAll, ownersByUnit } from "@/components/finance/fees/data";
import { addDays, num, surnameOf } from "@/components/finance/fees/utils";

/** A small sample bank statement (CSV) that uses this community's real flat labels and owner surnames. */
export async function GET(_req: Request, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const { rows: units } = await fetchAll<{ id: string; label: string }>((from, to) =>
    supabase.from("units").select("id, label").eq("community_id", cid).order("label").range(from, to));
  const owners = units.length > 0 ? await ownersByUnit(supabase, cid, today) : new Map<string, string[]>();

  // A surname that belongs to exactly one flat, so the example shows a surname match.
  const bySurname = new Map<string, { unitId: string; name: string }[]>();
  for (const u of units) {
    for (const n of owners.get(u.id) ?? []) {
      const sn = surnameOf(n);
      if (sn) bySurname.set(sn, [...(bySurname.get(sn) ?? []), { unitId: u.id, name: n }]);
    }
  }
  const surnameHit = Array.from(bySurname.values()).find((list) => new Set(list.map((x) => x.unitId)).size === 1)?.[0] ?? null;

  const picks = [units[0], units[Math.floor(units.length / 2)]].filter((u): u is { id: string; label: string } => !!u);
  const surnameUnit = surnameHit ? units.find((u) => u.id === surnameHit.unitId) ?? null : null;
  const chosenIds = Array.from(new Set([...picks.map((u) => u.id), ...(surnameUnit ? [surnameUnit.id] : [])]));

  // Use each flat's latest regular fee as the example amount, so a real statement would look like this.
  const amounts = new Map<string, number>();
  if (chosenIds.length > 0) {
    const { data } = await supabase.from("fee_charges").select("unit_id, amount_cents, due_date")
      .eq("community_id", cid).in("unit_id", chosenIds).not("schedule_id", "is", null)
      .order("due_date", { ascending: false }).limit(100);
    for (const c of (data ?? []) as { unit_id: string; amount_cents: number }[]) {
      if (!amounts.has(c.unit_id)) amounts.set(c.unit_id, num(c.amount_cents));
    }
  }
  const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const amountFor = (unitId: string | undefined) => euros(unitId ? amounts.get(unitId) ?? 25000 : 25000);
  const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  const lines: string[][] = [["date", "description", "amount"]];
  if (picks[0]) lines.push([addDays(today, -6), `TRANSFERENCIA CUOTA COMUNIDAD PISO ${picks[0].label}`, amountFor(picks[0].id)]);
  if (picks[1]) lines.push([dmy(addDays(today, -5)), `Community fees flat ${picks[1].label.replace(/-/g, " ")}`, amountFor(picks[1].id)]);
  if (surnameHit && surnameUnit) {
    const surname = surnameHit.name.trim().split(/\s+/).pop() ?? "";
    lines.push([addDays(today, -4), `TRANSFER FROM ${surname.toUpperCase()} - FEES`, amountFor(surnameUnit.id)]);
  }
  lines.push([dmy(addDays(today, -3)), "Transfer from unknown sender", "150,00"]);
  lines.push([addDays(today, -2), "BANK CHARGES", "-12,50"]);

  const csv = "﻿" + lines.map((l) => l.map(esc).join(";")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bank-statement-example-${s.community.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
