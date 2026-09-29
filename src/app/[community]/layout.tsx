import type { Metadata } from "next";
import { getCommunityOr404 } from "@/lib/community";
import { inkFor } from "@/lib/color";

type P = { params: Promise<{ community: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { community } = await params;
  const c = await getCommunityOr404(community);
  return {
    title: { default: c.name, template: `%s · ${c.name}` },
    manifest: `/${c.slug}/manifest.webmanifest`,
    icons: c.branding?.logo_url ? [{ url: c.branding.logo_url }] : undefined,
    appleWebApp: { title: c.name, capable: true },
  };
}

/** White-label wrapper: every page under /<community> gets that community's colours. */
export default async function CommunityLayout({ children, params }: P & { children: React.ReactNode }) {
  const { community } = await params;
  const c = await getCommunityOr404(community);
  const brand = c.branding?.primary_color ?? "#0f766e";
  const style = {
    "--brand": brand,
    "--brand-ink": inkFor(brand),
    "--accent": c.branding?.accent_color ?? "#d97706",
  } as React.CSSProperties;
  return <div style={style} className="min-h-screen">{children}</div>;
}
