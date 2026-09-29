import { requireAdmin } from "@/lib/community";
import { todayInput } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import MeetingForm from "@/components/meetings/MeetingForm";

export const metadata = { title: "Plan a meeting" };

export default async function NewMeetingPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  const base = `/${s.community.slug}`;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plan a meeting"
        back={{ href: `${base}/meetings`, label: "Meetings" }}
        intro="Announce a meeting that will take place in person or online (Zoom, Teams, Google Meet). Residents will see it on the Meetings page and on their home screen."
      />
      <MeetingForm
        slug={s.community.slug}
        timezone={s.community.timezone}
        cancelHref={`${base}/meetings`}
        minStart={`${todayInput(s.community.timezone)}T00:00`}
        initial={{
          title: "",
          meeting_type: "informal",
          starts_at: "",
          duration_minutes: "60",
          location: "",
          meeting_url: "",
          agenda: "",
          status: "scheduled",
        }}
      />
    </div>
  );
}
