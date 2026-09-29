import { Download } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice, PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import { fetchAll } from "@/components/finance/fees/data";
import ImportFlow from "./ImportFlow";

export const metadata = { title: "Import bank statement" };

export default async function ImportStatementPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const { rows: units, error } = await fetchAll<{ id: string; label: string }>((from, to) =>
    supabase.from("units").select("id, label").eq("community_id", s.community.id).order("label").range(from, to));

  return (
    <>
      <PageHeader
        title="Import bank statement"
        intro="Record many owner payments at once from your bank’s CSV file, instead of typing them one by one."
        back={{ href: `${base}/finance/fees`, label: "Owner fees" }}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-6">
        {!!error && <Notice tone="bad">The list of flats could not be loaded. Please refresh the page.</Notice>}

        <Card className="no-print flex flex-col gap-3">
          <h2 className="text-xl font-bold">How it works</h2>
          <ol className="flex list-decimal flex-col gap-1 pl-6">
            <li>In your online banking, download the account movements as a <strong>CSV file</strong>.</li>
            <li>Choose the file below. It needs three columns: <strong>date</strong>, <strong>description</strong> and <strong>amount</strong>.</li>
            <li>We look for a flat number (for example “A-2B”, “A 2B” or “A2B”) or an owner’s surname in each description.</li>
            <li>Check the list, choose a flat for any payment without a match, then confirm.</li>
          </ol>
          <p className="hint">
            Columns may be separated by “;” or “,”. Amounts may be written 1.234,56 or 1234.56. Dates may be written 2026-10-03 or 03/10/2026.
            Money going out of the account (minus amounts) is ignored.
          </p>
          <a href={`${base}/finance/fees/import/example`} download
            className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink no-underline hover:bg-bg">
            <Download aria-hidden className="size-5" /> Download example CSV
          </a>
        </Card>

        <ImportFlow slug={s.community.slug} units={units} currency={s.community.currency} />
      </div>
    </>
  );
}
