import { requireFinance } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import FinanceHeader from "@/components/finance/FinanceHeader";
import { jobAnchor } from "@/components/finance-ops/dates";
import QuoteForm from "./QuoteForm";

export const metadata = { title: "Add a quote" };

export default async function NewQuotePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { community } = await params;
  const { job } = await searchParams;
  const s = await requireFinance(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}/finance/quotes`;

  const [{ data: suppliers }, { data: quotes }] = await Promise.all([
    supabase.from("suppliers").select("id, name, service_type").eq("community_id", c).eq("active", true).order("name"),
    supabase.from("quotes").select("job_title").eq("community_id", c),
  ]);
  const jobs = Array.from(new Set((quotes ?? []).map((q) => q.job_title))).sort();
  const known = job && jobs.includes(job) ? job : "";

  return (
    <div className="max-w-2xl">
      <FinanceHeader title="Add a quote" intro={known ? `For “${known}”.` : "For a job or a contract renewal."}
        back={{ href: known ? `${base}#${jobAnchor(known)}` : base, label: "Quotes" }} />
      <QuoteForm slug={s.community.slug} jobs={jobs} job={known} suppliers={suppliers ?? []} cancelHref={base} />
    </div>
  );
}
