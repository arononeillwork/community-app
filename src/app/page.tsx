import { redirect } from "next/navigation";
import { ArrowRight, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Notice, buttonClass } from "@/components/ui";

export const metadata = { title: "Find your community" };

/** Turn "Oceana Gardens", "oceana-gardens" or a pasted link into a community slug. */
function toSlug(input: string) {
  const fromUrl = input.match(/\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/i)?.[1];
  const raw = (input.includes("/") && fromUrl) ? fromUrl : input;
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function findCommunity(form: FormData) {
  "use server";
  const slug = toSlug(String(form.get("community") ?? ""));
  if (!slug) redirect("/?missing=1");
  const supabase = await createClient();
  const { data } = await supabase.from("communities").select("slug").eq("slug", slug).eq("status", "active").maybeSingle();
  redirect(data ? `/${data.slug}` : `/?missing=1`);
}

/**
 * Platform front door. Communities are white-labelled and reached by their own link, so this page
 * does not list them (that would publish the client list); it only helps someone who knows the name.
 */
export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const { missing } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-16">
      <div>
        <span className="grid size-11 place-items-center rounded-xl bg-ink text-surface"><Building2 aria-hidden className="size-5" /></span>
        <h1 className="mt-4 text-[1.875rem] font-semibold leading-tight">Find your community</h1>
        <p className="mt-1 text-muted">Use the link your community sent you, or type its name.</p>
      </div>
      {missing && <Notice tone="warn">We couldn&apos;t find that community. Check the name in your welcome email, or ask your building&apos;s office.</Notice>}
      <form action={findCommunity} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="field">
          <label htmlFor="community">Community name or link</label>
          <input id="community" name="community" required className="input" placeholder="e.g. Oceana Gardens" autoComplete="off" />
        </div>
        <button type="submit" className={buttonClass("primary", "md", "w-full")}>Continue <ArrowRight aria-hidden className="size-4" /></button>
      </form>
    </main>
  );
}
