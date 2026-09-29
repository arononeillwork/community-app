import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { syncPrefCookies } from "../../login/actions";

const OTP_TYPES: EmailOtpType[] = ["invite", "magiclink", "signup", "recovery", "email_change", "email"];

/**
 * Magic-link / invite landing, then go to the community home.
 * - `?code=`: PKCE flow (magic links sent from the sign-in page).
 * - `?token_hash=&type=`: invite emails (see supabase/templates/invite.html). Invites are created
 *   server-side with the admin API, which cannot use PKCE, so the email links here with a token hash.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const sp = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;
  const supabase = await createClient();

  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      await syncPrefCookies(data.user.id);
      return NextResponse.redirect(`${origin}/${community}/home`);
    }
  }

  const code = sp.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await syncPrefCookies(data.user.id);
      return NextResponse.redirect(`${origin}/${community}/home`);
    }
  }
  return NextResponse.redirect(`${origin}/${community}/login?error=link`);
}
