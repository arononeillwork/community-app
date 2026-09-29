import Link from "next/link";
import Form from "next/form";
import {
  BookOpen, FileText, Map as MapIcon, MessageCircleQuestion, Mic, Phone, Search, Trash2, type LucideIcon,
} from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Swatch } from "@/components/info/BinWeekTable";
import { DAY_NAMES, telHref, weekdayIn } from "@/components/info/labels";
import { searchCommunity, type GroupKey } from "./search";
import Highlight from "./Highlight";

export const metadata = { title: "Ask a question" };

const EXAMPLES = ["Which bin tomorrow?", "Pool opening hours", "Pharmacy", "Parking", "Quiet hours", "Bus to Marbella"];

const GROUPS: { key: GroupKey; title: string; icon: LucideIcon; more?: (base: string) => { href: string; label: string } }[] = [
  { key: "bins", title: "Bins and rubbish", icon: Trash2, more: (b) => ({ href: `${b}/info#bins`, label: "See the full bin calendar" }) },
  { key: "info", title: "Building information and rules", icon: BookOpen, more: (b) => ({ href: `${b}/info`, label: "All building information" }) },
  { key: "faq", title: "Questions and answers", icon: MessageCircleQuestion },
  { key: "places", title: "Local places", icon: MapIcon, more: (b) => ({ href: `${b}/local`, label: "All local places" }) },
  { key: "documents", title: "Documents", icon: FileText, more: (b) => ({ href: `${b}/documents`, label: "All documents" }) },
];

export default async function AskPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  const base = `/${s.community.slug}`;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 200);
  const tomorrow = weekdayIn(s.community.timezone, 1);

  const result = q ? await searchCommunity(await createClient(), s.community.id, base, q, tomorrow) : null;
  const contacts = Array.isArray(s.community.info?.emergency_contacts) ? s.community.info.emergency_contacts : [];
  const emergency = contacts.find((c) => c && typeof c.phone === "string" && c.phone.trim()) ?? { label: "Emergencies", phone: "112" };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Ask a question"
        intro="Look up bin days, house rules, opening hours, local places and documents." />

      {/* Working search (no AI) */}
      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Search aria-hidden className="size-7" /> Search community information</h2>
        <Form action={`${base}/ask`} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="field flex-1">
            <label htmlFor="q">Type a question or a word</label>
            <input id="q" name="q" type="search" defaultValue={q} maxLength={200} className="input min-h-14 text-xl"
              placeholder="e.g. pool" aria-describedby="q-hint" />
          </div>
          <button className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-8 text-lg font-bold text-brand-ink hover:brightness-110">
            <Search aria-hidden className="size-6" /> Search
          </button>
        </Form>
        <p id="q-hint" className="hint">Short questions work best. One or two words is enough.</p>
        <div>
          <h3 className="mb-2 font-bold">Or try one of these:</h3>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => {
              const on = ex.toLowerCase() === q.toLowerCase();
              return (
                <li key={ex}>
                  <Link href={`${base}/ask?q=${encodeURIComponent(ex)}`} aria-current={on ? "true" : undefined}
                    className={`inline-flex min-h-12 items-center rounded-full border-2 px-5 text-lg font-bold no-underline ${
                      on ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:border-brand"}`}>
                    {ex}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <section aria-labelledby="results-heading" className="flex flex-col gap-5">
          <h2 id="results-heading" className="text-2xl font-bold" aria-live="polite">
            {result.total === 0 ? <>Nothing found for “{q}”</> : <>{result.total} {result.total === 1 ? "result" : "results"} for “{q}”</>}
          </h2>

          {result.binIntent && (
            <div className="rounded-card border-2 border-brand bg-brand-soft p-5">
              <h3 className="mb-2 flex items-center gap-2 text-xl font-bold"><Trash2 aria-hidden className="size-6" /> Tomorrow, {DAY_NAMES[tomorrow]}</h3>
              {result.tomorrowBins.length === 0 ? (
                <p className="text-lg">No bins are collected tomorrow.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result.tomorrowBins.map((b) => (
                    <li key={b.title} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-2">
                      <Swatch hex={b.swatch} className="size-7" />
                      <span className="text-lg font-bold">{b.title}</span>
                      {b.putOut && <span className="text-muted">Put out: {b.putOut}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.total === 0 ? (
            <Empty title="We could not find anything with those words.">
              <p>Try one simple word, such as “pool”, “parking” or “pharmacy”.</p>
              <p className="mt-2">You can also <Link href={`${base}/contacts`} className="inline-flex min-h-12 items-center font-bold text-brand underline">contact the community office</Link>.</p>
            </Empty>
          ) : (
            GROUPS.filter((g) => result.groups[g.key].length > 0).map((g) => {
              const hits = result.groups[g.key];
              const more = g.more?.(base);
              return (
                <Card key={g.key} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-xl font-bold">
                    <g.icon aria-hidden className="size-6" /> {g.title} <span className="font-normal text-muted">({hits.length})</span>
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {hits.map((h) => (
                      <li key={h.id} className="rounded-xl border border-line bg-bg p-4">
                        <div className="flex items-center gap-3">
                          {h.swatch && <Swatch hex={h.swatch} />}
                          {h.href ? (
                            <Link href={h.href} className="inline-flex min-h-12 items-center text-lg font-bold text-brand underline underline-offset-4">
                              <Highlight text={h.title} terms={result.terms} />
                            </Link>
                          ) : (
                            <span className="text-lg font-bold"><Highlight text={h.title} terms={result.terms} /></span>
                          )}
                        </div>
                        {h.text && <p className="mt-1 whitespace-pre-line"><Highlight text={h.text} terms={result.terms} /></p>}
                      </li>
                    ))}
                  </ul>
                  {more && (
                    <Link href={more.href} className="inline-flex min-h-12 w-fit items-center font-bold text-brand underline">{more.label} <span aria-hidden className="ml-1">→</span></Link>
                  )}
                </Card>
              );
            })
          )}
        </section>
      )}

      {/* Coming soon: the assistant */}
      <Card className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-bold">Ask out loud – coming soon</h2>
        <button type="button" disabled aria-describedby="assistant-soon"
          className="flex size-40 flex-col items-center justify-center gap-2 rounded-full border-4 border-dashed border-line-strong bg-bg p-4 text-lg font-bold text-muted disabled:cursor-not-allowed">
          <Mic aria-hidden className="size-14" strokeWidth={1.5} />
          <span>Voice questions – coming soon</span>
        </button>
        <div id="assistant-soon" className="max-w-xl text-left">
          <p>
            Soon you will be able to press this button and ask a question out loud, or type it, in your own language.
            The community assistant will answer in a few simple sentences, using the community&apos;s own information.
          </p>
          <p className="mt-2">For example: “Which bin goes out tonight?”, “When is the next meeting?” or “Where is the nearest pharmacy?”</p>
          <p className="mt-2 font-bold">Until then, please use the search above.</p>
        </div>
      </Card>

      <p className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-bad/40 bg-bad-soft px-4 py-3 font-bold">
        <Phone aria-hidden className="size-5 text-bad" /> In an emergency call
        <a href={telHref(emergency.phone)} className="tabular inline-flex min-h-12 items-center text-xl text-bad underline">{emergency.phone}</a>
        <Link href={`${base}/info`} className="inline-flex min-h-12 items-center font-bold text-ink underline sm:ml-auto">All emergency numbers</Link>
      </p>
    </div>
  );
}
