import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { MeetingForm } from "@/components/meetings/MeetingForm";
import { UUID_RE, agendaItems, toLocalInput, zoneName } from "@/components/meetings/meeting-utils";
import { saveMeeting } from "../../actions";

export const metadata = { title: "Edit meeting" };

export default async function EditMeetingPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: m } = await supabase.from("meetings")
    .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, status")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!m) notFound();
  const tz = s.community.timezone;
  const back = `/${s.community.slug}/meetings/${m.id}`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit meeting" back={{ href: back, label: m.title }}
        intro="Members are notified if the date, place, link or status changes." />
      <MeetingForm
        action={saveMeeting.bind(null, s.community.slug)}
        zone={`Times are in ${zoneName(tz)}.`}
        cancelHref={back}
        initial={{
          id: m.id,
          title: m.title,
          meeting_type: m.meeting_type,
          starts_at: toLocalInput(m.starts_at, tz),
          duration_minutes: m.duration_minutes,
          location: m.location ?? "",
          meeting_url: m.meeting_url ?? "",
          agenda: agendaItems(m.agenda).join("\n"),
          status: m.status,
        }}
      />
    </div>
  );
}
