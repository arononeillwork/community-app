import { getCommunity } from "@/lib/community";

/** Per-community PWA manifest so "Add to Home Screen" shows the community's own name and icon. */
export async function GET(_req: Request, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const c = await getCommunity(community);
  if (!c) return new Response("Not found", { status: 404 });
  return Response.json({
    name: c.name,
    short_name: c.name,
    start_url: `/${c.slug}/home`,
    scope: `/${c.slug}/`,
    display: "standalone",
    background_color: "#f7f8f9",
    theme_color: c.branding?.primary_color ?? "#0f766e",
    icons: c.branding?.logo_url ? [{ src: c.branding.logo_url, sizes: "any", type: "image/svg+xml", purpose: "any" }] : [],
  }, { headers: { "content-type": "application/manifest+json" } });
}
