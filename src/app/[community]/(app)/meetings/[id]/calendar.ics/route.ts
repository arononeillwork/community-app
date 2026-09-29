import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { buildIcs } from "@/components/meetings/ics";
import { calendarDescription, dayKey, endMs, originFrom, safeHttpUrl } from "@/components/meetings/meeting-utils";

export const dynamic = "force-dynamic";

function fileName(title: string) {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meeting";
}

/** iCalendar (.ics) download for one meeting. Members only (redirects to the login page otherwise). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();

  const { data: m } = await supabase
    .from("meetings")
    .select("id, title, starts_at, duration_minutes, location, meeting_url, agenda, status, created_at, updated_at")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!m) {
    return new NextResponse("Meeting not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const detailsUrl = `${originFrom(request.headers)}/${s.community.slug}/meetings/${m.id}`;
  const joinUrl = safeHttpUrl(m.meeting_url);
  const body = buildIcs({
    uid: `meeting-${m.id}@community-app`,
    title: m.title,
    start: new Date(m.starts_at),
    end: new Date(endMs(m.starts_at, m.duration_minutes)),
    location: m.location || joinUrl,
    description: calendarDescription(m, detailsUrl),
    url: joinUrl ?? detailsUrl,
    status: m.status === "cancelled" ? "CANCELLED" : m.status === "postponed" ? "TENTATIVE" : "CONFIRMED",
    alarmMinutes: [24 * 60, 60],
    lastModified: m.updated_at ? new Date(m.updated_at) : null,
    // Seconds between creation and the last edit: grows with every change, so calendar apps
    // update the event they already have instead of adding a second one.
    sequence: m.updated_at && m.created_at
      ? Math.max(0, Math.floor((new Date(m.updated_at).getTime() - new Date(m.created_at).getTime()) / 1000))
      : null,
  });

  const name = `${fileName(m.title)}-${dayKey(m.starts_at, s.community.timezone)}.ics`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
