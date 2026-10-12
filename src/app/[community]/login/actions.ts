"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCommunity } from "@/lib/community";

export type LoginState = { error?: string; sent?: string } | undefined;

/** Copy saved accessibility preferences into cookies so they apply on every page. */
export async function syncPrefCookies(userId: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("user_preferences").select("*").eq("profile_id", userId).maybeSingle();
  if (!p) return;
  const jar = await cookies();
  const opts = { path: "/", maxAge: 31536000, sameSite: "lax" as const };
  jar.set("a11y_fs", String(p.font_scale), opts);
  jar.set("a11y_hc", p.high_contrast ? "1" : "0", opts);
  jar.set("a11y_dys", p.dyslexia_font ? "1" : "0", opts);
  jar.set("a11y_rm", p.reduce_motion ? "1" : "0", opts);
  jar.set("a11y_theme", p.theme, opts);
  jar.set("lang", p.language, opts);
}

async function assertMember(slug: string) {
  const supabase = await createClient();
  const c = await getCommunity(slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!c || !user) return false;
  const { data: prof } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (prof?.is_platform_admin) return true;
  const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true })
    .eq("community_id", c.id).eq("profile_id", user.id).eq("status", "active");
  return (count ?? 0) > 0;
}

export async function signInWithPassword(slug: string, _prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "That email and password did not match. Please try again." };
  if (!(await assertMember(slug))) {
    await supabase.auth.signOut();
    return { error: "You're not registered in this community. Please contact the administrator." };
  }
  await syncPrefCookies(data.user.id);
  redirect(`/${slug}/home`);
}

export async function sendMagicLink(slug: string, _prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Please enter your email address." };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${site}/${slug}/auth/callback` },
  });
  // Don't reveal whether an address is registered.
  if (error && !/not found|signups not allowed/i.test(error.message)) return { error: "We couldn't send the email. Please try again." };
  return { sent: email };
}

export async function signOut(slug: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${slug}`);
}
