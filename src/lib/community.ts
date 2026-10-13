import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "tenant" | "owner" | "admin" | "treasurer";

export type Community = {
  id: string;
  slug: string;
  name: string;
  default_language: string;
  enabled_languages: string[];
  timezone: string;
  currency: string;
  settings: {
    tenant_requires_approval?: boolean;
    invoice_approval_threshold_cents?: number;
    features?: Record<string, boolean>;
  };
  branding: { logo_url: string | null; hero_image_url: string | null; primary_color: string; accent_color: string } | null;
  info: {
    tagline: Record<string, string>;
    welcome: Record<string, string>;
    address: string | null;
    lat: number | null;
    lng: number | null;
    office_hours: { label: string; hours: string }[];
    emergency_contacts: { label: string; phone: string }[];
    public_notices: { title: string; body: string; date: string }[];
  } | null;
};

export type Preferences = {
  font_scale: number;
  high_contrast: boolean;
  theme: string;
  reduce_motion: boolean;
  dyslexia_font: boolean;
  language: string;
  speech_rate: number;
  voice_enabled: boolean;
  simple_mode: boolean;
  notify_channel: string;
};

/** Public community data (branding + landing info). Readable without login. */
export const getCommunity = cache(async (slug: string): Promise<Community | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("communities")
    .select("id, slug, name, default_language, enabled_languages, timezone, currency, settings, branding:community_branding(*), info:community_public_info(*)")
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as Community) ?? null;
});

export const getCommunityOr404 = cache(async (slug: string) => {
  const c = await getCommunity(slug);
  if (!c) notFound();
  return c;
});

export type Session = {
  community: Community;
  userId: string;
  email: string;
  fullName: string;
  roles: Role[];
  prefs: Preferences | null;
  isAdmin: boolean;
  isFinance: boolean;
  isOwner: boolean;
  isTenant: boolean;
  /** Holiday-let or short-stay guest: building information only, no member list or documents. */
  isGuest: boolean;
};

/** Signed-in member of this community, or redirect to the community's login page. */
export const requireMember = cache(async (slug: string): Promise<Session> => {
  const community = await getCommunityOr404(slug);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = safeNext((await headers()).get("x-path"));
    redirect(`/${slug}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }

  const [{ data: memberships }, { data: profile }, { data: prefs }] = await Promise.all([
    supabase.from("memberships").select("role").eq("community_id", community.id).eq("profile_id", user.id).eq("status", "active"),
    supabase.from("profiles").select("full_name, is_platform_admin").eq("id", user.id).single(),
    supabase.from("user_preferences").select("*").eq("profile_id", user.id).maybeSingle(),
  ]);
  const roles = (memberships ?? []).map((m) => m.role as Role);
  if (profile?.is_platform_admin && !roles.includes("admin")) roles.push("admin");
  if (roles.length === 0) {
    // Invited but not joined yet: send them to accept the invitation.
    const { data: invites } = await supabase.rpc("my_invitations", { c: community.id });
    redirect(invites?.length ? `/${slug}/join` : `/${slug}/login?error=not_member`);
  }

  // Only a tenant with no other role can be a limited guest; skip the lookup for everyone else.
  const isGuest = roles.length === 1 && roles[0] === "tenant"
    ? Boolean((await supabase.rpc("is_limited_guest", { c: community.id })).data)
    : false;

  return {
    community,
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? "",
    roles,
    prefs: prefs as Preferences | null,
    isAdmin: roles.includes("admin"),
    isFinance: roles.includes("admin") || roles.includes("treasurer"),
    isOwner: roles.includes("owner"),
    isTenant: roles.includes("tenant"),
    isGuest,
  };
});

/** A member who is not a short-stay guest (guests don't get the member list or documents). */
export async function requireResident(slug: string) {
  const s = await requireMember(slug);
  if (s.isGuest) redirect(`/${slug}/home`);
  return s;
}

export async function requireFinance(slug: string) {
  const s = await requireMember(slug);
  if (!s.isFinance) redirect(`/${slug}/home`);
  return s;
}

export async function requireAdmin(slug: string) {
  const s = await requireMember(slug);
  if (!s.isAdmin) redirect(`/${slug}/home`);
  return s;
}

export function t(map: Record<string, string> | undefined | null, lang: string, fallback = "en") {
  if (!map) return "";
  return map[lang] ?? map[fallback] ?? Object.values(map)[0] ?? "";
}

/** A same-site path to return to after signing in, or null. Never another site, never the login page. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (/\/login(\?|$)|\/auth\/callback/.test(next) || next.length > 500) return null;
  return next;
}
