import { requireAdmin } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import { MeetingForm } from "@/components/meetings/MeetingForm";
import { toLocalInput, zoneName } from "@/components/meetings/meeting-utils";
import { saveMeeting } from "../actions";

export const metadata = { title: "New meeting" };

export default async function NewMeetingPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const tz = s.community.timezone;

  // Suggest two weeks from today at 18:00 local time.
  const suggested = toLocalInput(new Date(Date.now() + 14 * 86400000).toISOString(), tz).slice(0, 10) + "T18:00";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New meeting" back={{ href: `/${s.community.slug}/meetings`, label: "Meetings" }}
        intro="Members get a notice with the date, place and link." />
      <MeetingForm
        action={saveMeeting.bind(null, s.community.slug)}
        zone={`Times are in ${zoneName(tz)}.`}
        cancelHref={`/${s.community.slug}/meetings`}
        initial={{
          title: "", meeting_type: "committee", starts_at: suggested, duration_minutes: 60,
          location: "", meeting_url: "", agenda: "", status: "scheduled",
        }}
      />
    </div>
  );
}
