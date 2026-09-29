import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";
import QuoteForm from "@/components/finance/register/QuoteForm";
import { createQuote } from "../actions";

export const metadata = { title: "Add a quote" };

export default async function NewQuotePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { community } = await params;
  const { job } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const [{ data: quoteData }, { data: supplierData }] = await Promise.all([
    supabase.from("quotes").select("job_title").eq("community_id", s.community.id),
    supabase.from("suppliers").select("id, name").eq("community_id", s.community.id).eq("active", true).order("name"),
  ]);
  const jobs = Array.from(new Set(((quoteData ?? []) as { job_title: string }[]).map((q) => q.job_title))).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a quote" back={{ href: `${base}/finance/quotes`, label: "Quotes" }}
        intro="A quote is a price a company offers for a job before any work is done. Add each one so you can compare them." />
      <FinanceNav slug={s.community.slug} />
      <QuoteForm
        action={createQuote.bind(null, s.community.slug)}
        jobs={jobs}
        suppliers={(supplierData ?? []) as { id: string; name: string }[]}
        initialJob={(job ?? "").slice(0, 200)}
        cancelHref={`${base}/finance/quotes`}
      />
    </div>
  );
}
