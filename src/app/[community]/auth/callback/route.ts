import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncPrefCookies } from "../../login/actions";

/** Magic-link / invite landing: exchange the code for a session, then go to the community home. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await syncPrefCookies(data.user.id);
      return NextResponse.redirect(`${origin}/${community}/home`);
    }
  }
  return NextResponse.redirect(`${origin}/${community}/login?error=link`);
}
