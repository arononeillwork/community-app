import type { NextRequest } from "next/server";
import { getCommunity } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { buildIcs, icsFilename } from "@/components/meetings/ics";
import { UUID_RE } from "@/components/meetings/meeting-utils";

/* "Add to calendar": one meeting as an iCalendar file.
   Route handlers do not get the (app) layout, so membership is checked here: the meeting is read with
   the signed-in user's client, and RLS only returns it to members of its community. Anything else is a 404. */

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const c = await getCommunity(community);
  if (!c) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: m } = await supabase.from("meetings")
    .select("id, title, starts_at, duration_minutes, location, meeting_url, agenda, status")
    .eq("id", id).eq("community_id", c.id).maybeSingle();
  if (!m) return notFound();

  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  const pageUrl = `${proto}://${host}/${c.slug}/meetings/${m.id}`;

  const body = buildIcs(m, { pageUrl, host: host.split(":")[0], communityName: c.name });
  const filename = icsFilename(m.title);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
