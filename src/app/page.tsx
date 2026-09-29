import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { t } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";
import { ROLES, ROLE_LABELS, isRole, type AdminRole } from "@/components/admin/labels";

export const metadata = { title: "Community app" };

type CommunityCard = { id: string; slug: string; name: string; logoUrl: string | null; tagline: string };

/** PostgREST returns a one-to-one embed as an object; be forgiving if it ever comes back as a list. */
function one<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

function Logo({ url, name, size }: { url: string | null; name: string; size: 12 | 16 }) {
  const cls = size === 16 ? "size-16 text-2xl" : "size-12 text-xl";
  return url ? (
    <Image src={url} alt={`Logo of ${name}`} width={size * 4} height={size * 4} unoptimized
      className={`${cls} shrink-0 rounded-xl border border-line bg-white object-contain`} />
  ) : (
    <span aria-hidden className={`${cls} flex shrink-0 items-center justify-center rounded-xl border border-line bg-bg font-bold text-ink`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Platform home: not white-labelled. Lists your communities and every active community. */
export default async function PlatformHome() {
  const supabase = await createClient();
  const lang = (await cookies()).get("lang")?.value ?? "en";
  const { data: { user } } = await supabase.auth.getUser();

  // Communities are publicly readable (active ones only).
  const { data: communityRows } = await supabase
    .from("communities")
    .select("id, slug, name, branding:community_branding(logo_url), info:community_public_info(tagline)")
    .eq("status", "active")
    .order("name");
  const communities: CommunityCard[] = (communityRows ?? []).map((c) => {
    const branding = one<{ logo_url: string | null }>(c.branding);
    const info = one<{ tagline: Record<string, string> | null }>(c.info);
    return {
      id: String(c.id), slug: String(c.slug), name: String(c.name),
      logoUrl: branding?.logo_url ?? null, tagline: t(info?.tagline ?? null, lang),
    };
  });

  let mine: (CommunityCard & { roles: AdminRole[] })[] = [];
  let isPlatformAdmin = false;
  let firstName = "";
  if (user) {
    const [{ data: memberships }, { data: profile }] = await Promise.all([
      supabase
        .from("memberships")
        .select("role, community:communities(id, slug, name, status, branding:community_branding(logo_url))")
        .eq("profile_id", user.id)
        .eq("status", "active"),
      supabase.from("profiles").select("full_name, is_platform_admin").eq("id", user.id).maybeSingle(),
    ]);
    isPlatformAdmin = !!profile?.is_platform_admin;
    firstName = String(profile?.full_name ?? "").split(" ")[0] ?? "";

    const byCommunity = new Map<string, CommunityCard & { roles: AdminRole[] }>();
    for (const m of memberships ?? []) {
      const c = one<{ id: string; slug: string; name: string; status: string; branding: unknown }>(m.community);
      if (!c || c.status !== "active" || !isRole(m.role)) continue;
      const entry = byCommunity.get(c.id) ?? {
        id: c.id, slug: c.slug, name: c.name, logoUrl: one<{ logo_url: string | null }>(c.branding)?.logo_url ?? null, tagline: "", roles: [],
      };
      if (!entry.roles.includes(m.role)) entry.roles.push(m.role);
      byCommunity.set(c.id, entry);
    }
    mine = [...byCommunity.values()]
      .map((c) => ({ ...c, roles: [...c.roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:py-14">
        <section className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-lg font-bold text-muted">
            <Building2 aria-hidden className="size-7" /> For apartment communities
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Community app</h1>
          <p className="max-w-3xl text-xl">
            {user && firstName ? `Welcome back, ${firstName}. ` : ""}
            One simple place for everyone who lives in or owns a flat: bin days, reporting a problem, meetings,
            documents, useful phone numbers and where the community&apos;s money goes.
          </p>
          <p className="max-w-3xl text-muted">
            Each community has its own page. Choose yours below and sign in with the email address your community office has for you.
            You can make the text bigger at any time in the settings.
          </p>
        </section>

        {isPlatformAdmin && (
          <Notice tone="info">
            <span className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-5 shrink-0" /> Platform administration – coming soon.
            </span>
          </Notice>
        )}

        {user && (
          <section aria-labelledby="mine-title" className="flex flex-col gap-4">
            <h2 id="mine-title" className="text-3xl font-bold">Your communities</h2>
            {mine.length === 0 ? (
              <p className="rounded-card border-2 border-dashed border-line bg-surface p-6 text-lg">
                {isPlatformAdmin
                  ? "You are not a member of any community. As a platform administrator you can open any community below."
                  : "You are signed in, but not a member of any community yet. Please ask your community office to add you."}
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {mine.map((c) => (
                  <li key={c.id}>
                    <Link href={`/${c.slug}/home`}
                      className="card flex min-h-28 items-center gap-4 rounded-card border-2 border-line-strong bg-surface p-5 text-ink no-underline transition-colors hover:border-ink hover:bg-bg">
                      <Logo url={c.logoUrl} name={c.name} size={16} />
                      <span className="flex-1">
                        <span className="block text-2xl font-bold">{c.name}</span>
                        <span className="block text-muted">{c.roles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold">
                        Open <ArrowRight aria-hidden className="size-5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="all-title" className="flex flex-col gap-4">
          <h2 id="all-title" className="text-3xl font-bold">{user ? "All communities" : "Find your community"}</h2>
          {communities.length === 0 ? (
            <p className="rounded-card border-2 border-dashed border-line bg-surface p-6 text-lg">No communities have been set up yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {communities.map((c) => (
                <li key={c.id}>
                  <Link href={`/${c.slug}`}
                    className="card flex h-full min-h-24 items-center gap-4 rounded-card border-2 border-line bg-surface p-5 text-ink no-underline transition-colors hover:border-ink hover:bg-bg">
                    <Logo url={c.logoUrl} name={c.name} size={12} />
                    <span>
                      <span className="block text-xl font-bold">{c.name}</span>
                      {c.tagline && <span className="block text-muted">{c.tagline}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-line bg-surface py-6 text-center text-muted">Community app</footer>
    </div>
  );
}
