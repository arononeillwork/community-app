import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Find your community" };

/** Platform front door: links to each community's own branded site. */
export default async function PlatformHome() {
  const supabase = await createClient();
  const { data: communities } = await supabase
    .from("communities").select("slug, name, branding:community_branding(logo_url)").eq("status", "active").order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <span className="grid size-11 place-items-center rounded-xl bg-ink text-surface"><Building2 aria-hidden className="size-5" /></span>
        <h1 className="mt-4 text-[1.875rem] font-semibold leading-tight">Find your community</h1>
        <p className="mt-1 text-muted">Choose where you live to see its notices, contacts and documents.</p>
      </div>
      <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {(communities ?? []).map((c) => {
          const logo = (c.branding as unknown as { logo_url: string | null } | null)?.logo_url;
          return (
            <li key={c.slug} className="border-b border-line last:border-0">
              <Link href={`/${c.slug}`} className="flex items-center gap-3 px-5 py-4 text-ink no-underline transition-colors hover:bg-surface-2">
                {logo ? <img src={logo} alt="" className="size-9 rounded-[10px]" />
                  : <span className="grid size-9 place-items-center rounded-[10px] bg-surface-2 font-semibold text-muted">{c.name[0]}</span>}
                <span className="font-medium">{c.name}</span>
                <ArrowRight aria-hidden className="ml-auto size-4 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
