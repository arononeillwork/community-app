import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { syncPrefCookies } from "../../login/actions";

const OTP_TYPES = new Set<EmailOtpType>(["invite", "magiclink", "signup", "recovery", "email_change", "email"]);

/**
 * Sign-in landing for emailed links, then on to the community home.
 * - Magic links from signInWithOtp (PKCE) arrive with ?code=.
 * - Invites arrive with ?token_hash=…&type=invite (see supabase/templates/invite.html).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const sp = request.nextUrl.searchParams;
  const code = sp.get("code");
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  const origin = request.nextUrl.origin;
  const supabase = await createClient();

  let userId: string | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) userId = data.user?.id ?? null;
  }

  if (userId) {
    await syncPrefCookies(userId);
    return NextResponse.redirect(`${origin}/${community}/home`);
  }
  return NextResponse.redirect(`${origin}/${community}/login?error=link`);
}
