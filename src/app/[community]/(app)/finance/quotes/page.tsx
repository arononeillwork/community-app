import Link from "next/link";
import clsx from "clsx";
import { Check, FilePlus2, FileText, Plus, Scale } from "lucide-react";
import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, money, todayInput } from "@/lib/format";
import { Badge, Button, Card, Empty, Notice } from "@/components/ui";
import { Toolbar } from "@/components/finance-ops/Toolbar";
import { SubmitButton } from "@/components/finance-ops/SubmitButton";
import { daysBetween, displayFileName, jobAnchor, relativeDays } from "@/components/finance-ops/dates";
import { signedFinanceUrls } from "@/components/finance-ops/storage";
import { chooseQuote } from "./actions";

export const metadata = { title: "Quotes" };

type Quote = {
  id: string; job_title: string; supplier_id: string | null; supplier_name: string | null; amount_cents: number;
  valid_until: string | null; file_path: string | null; chosen: boolean; notes: string | null; created_at: string;
  supplier: { name: string } | null;
};

export default async function QuotesPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ added?: string; chosen?: string; error?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const slug = s.community.slug;
  const base = `/${slug}/finance/quotes`;
  const cur = s.community.currency;
  const today = todayInput(s.community.timezone);

  const { data } = await supabase.from("quotes")
    .select("id, job_title, supplier_id, supplier_name, amount_cents, valid_until, file_path, chosen, notes, created_at, supplier:suppliers(name)")
    .eq("community_id", s.community.id).order("created_at", { ascending: false });
  const quotes = (data ?? []) as unknown as Quote[];
  const files = await signedFinanceUrls(quotes.map((q) => q.file_path));

  // Group by job: jobs still to decide first, then the most recently quoted.
  const jobs = new Map<string, Quote[]>();
  for (const q of quotes) jobs.set(q.job_title, [...(jobs.get(q.job_title) ?? []), q]);
  const groups = [...jobs.entries()]
    .map(([title, list]) => ({ title, list: [...list].sort((a, b) => Number(a.amount_cents) - Number(b.amount_cents)), chosen: list.find((q) => q.chosen) ?? null,
      latest: list.reduce((m, q) => (q.created_at > m ? q.created_at : m), "") }))
    .sort((a, b) => Number(!!a.chosen) - Number(!!b.chosen) || b.latest.localeCompare(a.latest));

  const added = sp.added ? quotes.find((q) => q.id === sp.added) : undefined;
  const chosen = sp.chosen ? quotes.find((q) => q.id === sp.chosen) : undefined;

  return (
    <>
      <Toolbar
        title="Quotes"
        description={groups.length ? `${groups.length} ${groups.length === 1 ? "job" : "jobs"} · ${groups.filter((g) => !g.chosen).length} to decide` : "Compare prices before choosing a supplier."}
        actions={<Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> Add a quote</Button>}
      />

      <div className="flex flex-col gap-5">
        {added && <Notice tone="ok">Quote from {added.supplier?.name ?? added.supplier_name} added to “{added.job_title}”.</Notice>}
        {chosen && (
          <Notice tone="ok" title={`${chosen.supplier?.name ?? chosen.supplier_name} chosen for “${chosen.job_title}”`}>
            When it is signed, <Link href={`/${slug}/finance/contracts/new?quote=${chosen.id}`}>create the contract</Link> to track its dates and cost.
          </Notice>
        )}
        {sp.error && <Notice tone="bad">That did not work. Please try again.</Notice>}

        {groups.length === 0 ? (
          <Empty icon={Scale} title="No quotes yet" action={<Button href={`${base}/new`}><Plus aria-hidden className="size-4" /> Add the first quote</Button>}>
            Collect two or three quotes for a job or a contract renewal, then compare them here.
          </Empty>
        ) : groups.map((g) => {
          const cheapest = g.list[0];
          return (
            <Card key={g.title}>
              <div id={jobAnchor(g.title)} className="mb-4 flex scroll-mt-24 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[1.0625rem] font-semibold leading-snug">{g.title}</h3>
                    {g.chosen ? <Badge tone="ok">Decided</Badge> : <Badge tone="warn">To decide</Badge>}
                  </div>
                  <p className="mt-0.5 text-[0.9375rem] text-muted">
                    {g.list.length} {g.list.length === 1 ? "quote" : "quotes"}
                    {g.list.length > 1 && ` · from ${money(cheapest.amount_cents, cur)} to ${money(g.list.at(-1)!.amount_cents, cur)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button href={`${base}/new?job=${encodeURIComponent(g.title)}`} variant="ghost" size="sm"><Plus aria-hidden className="size-4" /> Add a quote</Button>
                  {g.chosen && (
                    <Button href={`/${slug}/finance/contracts/new?quote=${g.chosen.id}`} variant="soft" size="sm">
                      <FilePlus2 aria-hidden className="size-4" /> Create contract from chosen quote
                    </Button>
                  )}
                </div>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((q) => {
                  const name = q.supplier?.name ?? q.supplier_name ?? "Supplier";
                  const isCheapest = g.list.length > 1 && q.id === cheapest.id;
                  const diff = Number(q.amount_cents) - Number(cheapest.amount_cents);
                  const validDays = q.valid_until ? daysBetween(today, q.valid_until) : null;
                  const expired = validDays != null && validDays < 0;
                  const url = q.file_path ? files.get(q.file_path) : undefined;
                  return (
                    <li key={q.id} className={clsx("flex flex-col rounded-xl border p-4",
                      q.chosen ? "border-brand bg-brand-soft/40 ring-1 ring-inset ring-brand" : isCheapest ? "border-ok/40 bg-ok-soft/40" : "border-line bg-surface")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{name}</div>
                          <div className="text-sm text-muted">{q.supplier_id ? "Known supplier" : "New company"}</div>
                        </div>
                        {q.chosen ? <Badge tone="brand"><Check aria-hidden className="-ml-0.5 size-3.5" /> Chosen</Badge>
                          : isCheapest ? <Badge tone="ok">Lowest price</Badge> : null}
                      </div>
                      <div className="tabular mt-3 text-[1.5rem] font-semibold leading-none">{money(q.amount_cents, cur)}</div>
                      <div className="mt-1 text-sm text-muted">
                        {isCheapest || g.list.length === 1 ? " " : `${money(diff, cur)} more (+${Math.round((diff / Math.max(1, Number(cheapest.amount_cents))) * 100)}%)`}
                      </div>
                      <div className="mt-3 text-sm">
                        {q.valid_until
                          ? expired ? <Badge tone="bad">Expired {date(q.valid_until)}</Badge>
                            : <span className={clsx(validDays! <= 7 ? "text-warn" : "text-muted")}>Valid until {date(q.valid_until)} ({relativeDays(validDays!)})</span>
                          : <span className="text-muted">No expiry date</span>}
                      </div>
                      {q.notes && <p className="mt-2 text-[0.9375rem] text-ink-2">{q.notes}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                        {!q.chosen && (
                          <form action={chooseQuote.bind(null, slug, q.id)}>
                            <SubmitButton variant={isCheapest ? "primary" : "secondary"} size="sm" pendingLabel="Saving…">Choose this quote</SubmitButton>
                          </form>
                        )}
                        {q.file_path && url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" title={displayFileName(q.file_path)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium no-underline hover:underline">
                            <FileText aria-hidden className="size-4" /> Quote file
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
