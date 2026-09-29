import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { centsToInput, date, money, todayInput } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice, PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import ConfirmAction from "@/components/finance/register/ConfirmAction";
import { daysBetween, relativeDays } from "@/components/finance/register/dates";
import { chooseQuote, deleteQuote } from "./actions";

export const metadata = { title: "Quotes" };

type QuoteRow = {
  id: string; job_title: string; supplier_id: string | null; supplier_name: string | null; amount_cents: number;
  valid_until: string | null; file_path: string | null; chosen: boolean; notes: string | null; created_at: string;
  supplier: { name: string } | null;
};

export default async function QuotesPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ added?: string; chosen?: string; deleted?: string }>;
}) {
  const { community } = await params;
  const { added, chosen, deleted } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);

  const { data } = await supabase
    .from("quotes")
    .select("id, job_title, supplier_id, supplier_name, amount_cents, valid_until, file_path, chosen, notes, created_at, supplier:suppliers(name)")
    .eq("community_id", s.community.id)
    .order("created_at", { ascending: false });
  const quotes = ((data ?? []) as unknown as QuoteRow[]).map((q) => ({
    ...q,
    amount_cents: Number(q.amount_cents),
    company: q.supplier?.name ?? q.supplier_name ?? "Unknown company",
  }));

  // Signed links (valid 1 hour) for the quote documents in the private finance bucket.
  const paths = quotes.map((q) => q.file_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("finance").createSignedUrls(paths, 3600);
    for (const x of signed ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }

  // Group by job, newest job first (the order does not change when a quote is chosen).
  const groups = new Map<string, typeof quotes>();
  for (const q of quotes) groups.set(q.job_title, [...(groups.get(q.job_title) ?? []), q]);
  const jobs = Array.from(groups.entries())
    .map(([title, list]) => {
      const sorted = [...list].sort((a, b) => a.amount_cents - b.amount_cents);
      return {
        title,
        quotes: sorted,
        lowest: sorted[0]?.amount_cents ?? 0,
        chosen: sorted.find((q) => q.chosen) ?? null,
        latest: list.reduce((m, q) => (q.created_at > m ? q.created_at : m), ""),
      };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest));
  const justChosen = chosen ? quotes.find((q) => q.id === chosen && q.chosen) : undefined;

  return (
    <>
      <PageHeader
        title="Quotes"
        intro="Collect two or three quotes (price offers) for each job, compare them side by side, then choose one."
        actions={<Button href={`${base}/finance/quotes/new`} size="lg"><Plus aria-hidden className="size-5" /> Add quote</Button>}
      />
      <FinanceNav slug={s.community.slug} />

      <div className="flex flex-col gap-6">
        {added && <Notice tone="ok">The quote has been added.</Notice>}
        {justChosen && <Notice tone="ok">Saved: you chose {justChosen.company} for “{justChosen.job_title}”.</Notice>}
        {deleted && <Notice tone="ok">The quote has been deleted.</Notice>}

        <Card className="!bg-info-soft">
          <h2 className="mb-2 text-xl font-bold">How this works</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>The cheapest quote for each job is marked <strong>Lowest price</strong> in green.</li>
            <li>When the community decides, tap <strong>Choose this quote</strong>. It is then marked <strong>Chosen</strong>. Nothing is sent to the company.</li>
            <li>The cheapest quote is not always the best: check what each one includes and how long the price is valid.</li>
          </ul>
        </Card>

        {jobs.length === 0 ? (
          <Empty title="No quotes yet">
            <p className="mb-4">When a job needs doing, ask two or three companies for a price and add each quote here.</p>
            <Button href={`${base}/finance/quotes/new`} size="lg"><Plus aria-hidden className="size-5" /> Add the first quote</Button>
          </Empty>
        ) : (
          jobs.map((job, jobIndex) => (
            <section key={job.title} aria-labelledby={`job-${jobIndex}`} className="flex flex-col gap-4 rounded-card border-2 border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id={`job-${jobIndex}`} className="text-2xl font-bold">{job.title}</h2>
                  <p className="text-muted">
                    {job.quotes.length} quote{job.quotes.length === 1 ? "" : "s"} ·{" "}
                    {job.chosen ? <>Decision made: <strong className="text-ink">{job.chosen.company}</strong></> : "No quote chosen yet"}
                  </p>
                </div>
                <Link href={`${base}/finance/quotes/new?job=${encodeURIComponent(job.title)}`}
                  className="no-print inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line-strong px-4 font-bold no-underline text-ink hover:bg-bg">
                  <Plus aria-hidden className="size-5" /> Add another quote for this job
                </Link>
              </div>

              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {job.quotes.map((q) => {
                  // Only call it "lowest" when there is something to compare with.
                  const cheapest = job.quotes.length > 1 && q.amount_cents === job.lowest;
                  const diff = q.amount_cents - job.lowest;
                  const validDays = daysBetween(today, q.valid_until);
                  const expired = validDays != null && validDays < 0;
                  const fileUrl = q.file_path ? urls.get(q.file_path) : undefined;
                  return (
                    <li key={q.id}
                      className={clsx("flex flex-col gap-3 rounded-card border-2 p-5",
                        cheapest ? "border-ok bg-ok-soft" : "border-line bg-surface",
                        q.chosen && "ring-4 ring-brand ring-offset-2")}>
                      <div className="flex flex-wrap gap-2">
                        {q.chosen && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-0.5 text-sm font-bold text-brand-ink">
                            <CheckCircle2 aria-hidden className="size-4" /> Chosen
                          </span>
                        )}
                        {cheapest && <Badge tone="ok">Lowest price</Badge>}
                        {expired && <Badge tone="warn">Price expired</Badge>}
                      </div>
                      <h3 className="text-xl font-bold">
                        {q.supplier_id
                          ? <Link href={`${base}/finance/suppliers/${q.supplier_id}`} className="text-brand underline">{q.company}</Link>
                          : q.company}
                      </h3>
                      <div>
                        <div className="tabular text-3xl font-bold">{money(q.amount_cents, cur)}</div>
                        {diff > 0 && <div className="text-muted"><span className="tabular">{money(diff, cur)}</span> more than the lowest price</div>}
                      </div>
                      <p>
                        <span className="font-bold">Valid until: </span>
                        {q.valid_until ? <>{date(q.valid_until)} <span className="text-muted">({expired ? `ended ${relativeDays(validDays)}` : relativeDays(validDays)})</span></> : "Not stated"}
                      </p>
                      {q.notes?.trim() && <p className="whitespace-pre-line">{q.notes}</p>}
                      {fileUrl && (
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-fit items-center gap-2 font-bold text-brand underline">
                          <FileText aria-hidden className="size-5" /> Open the quote document <ExternalLink aria-hidden className="size-4" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      )}
                      <div className="no-print mt-auto flex flex-col gap-2 border-t border-line pt-3">
                        {!q.chosen && (
                          <ConfirmAction
                            action={chooseQuote.bind(null, s.community.slug, q.id)}
                            label="Choose this quote"
                            variant="primary"
                            confirmVariant="primary"
                            icon={<CheckCircle2 aria-hidden className="size-5" />}
                            question={<>Choose {q.company} for {money(q.amount_cents, cur)}?{job.chosen ? ` ${job.chosen.company} will no longer be marked as chosen.` : ""}{expired ? " Note: this price has expired, so check it with the company first." : ""}</>}
                            confirmLabel="Yes, choose this quote"
                          />
                        )}
                        {q.chosen && q.supplier_id && (
                          <Link
                            href={`${base}/finance/contracts/new?supplier=${q.supplier_id}&title=${encodeURIComponent(job.title)}&amount=${centsToInput(q.amount_cents)}&frequency=one_off`}
                            className="inline-flex min-h-12 items-center font-bold text-brand underline">
                            Make a contract from this quote
                          </Link>
                        )}
                        <ConfirmAction
                          action={deleteQuote.bind(null, s.community.slug, q.id)}
                          label="Delete"
                          variant="ghost"
                          icon={<Trash2 aria-hidden className="size-5" />}
                          question={<>Delete the quote from {q.company} ({money(q.amount_cents, cur)})? This cannot be undone.</>}
                          confirmLabel="Yes, delete this quote"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
