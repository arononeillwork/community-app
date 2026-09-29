import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 1. Resolves which community is being visited:
 *    - path:        /oceana-gardens/...            (default, always works)
 *    - subdomain:   oceana-gardens.<ROOT_DOMAIN>   → rewritten to /oceana-gardens/...
 *    - custom domain (communities.custom_domain)   → rewritten to /<slug>/...
 * 2. Refreshes the Supabase auth session cookie.
 */
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rootDomain = (process.env.ROOT_DOMAIN ?? "").toLowerCase();

  let slug: string | null = null;
  if (rootDomain && host.endsWith(`.${rootDomain}`)) {
    slug = host.slice(0, -(rootDomain.length + 1));
  } else if (host && !isPlatformHost(host, rootDomain)) {
    slug = await slugForCustomDomain(host);
  }

  let response: NextResponse;
  if (slug && !url.pathname.startsWith(`/${slug}`)) {
    url.pathname = `/${slug}${url.pathname === "/" ? "" : url.pathname}`;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next({ request });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

function isPlatformHost(host: string, rootDomain: string) {
  return host === "localhost" || host === "127.0.0.1" || host === rootDomain || host.endsWith(".vercel.app");
}

const domainCache = new Map<string, { slug: string | null; at: number }>();
async function slugForCustomDomain(host: string): Promise<string | null> {
  const hit = domainCache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.slug;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/communities?select=slug&custom_domain=eq.${encodeURIComponent(host)}`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
    );
    const rows = (await res.json()) as { slug: string }[];
    const slug = rows[0]?.slug ?? null;
    domainCache.set(host, { slug, at: Date.now() });
    return slug;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|communities/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
