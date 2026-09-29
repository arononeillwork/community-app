import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import MeetingForm from "@/components/meetings/MeetingForm";
import { utcToZonedInput } from "@/components/meetings/meeting-utils";

export const metadata = { title: "Edit meeting" };

export default async function EditMeetingPage({ params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireAdmin(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;

  const { data: m } = await supabase
    .from("meetings")
    .select("id, title, meeting_type, starts_at, duration_minutes, location, meeting_url, agenda, status")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit meeting"
        back={{ href: `${base}/meetings/${m.id}`, label: m.title }}
        intro="Change the details of this meeting. To call it off, choose the status “Cancelled”."
      />
      <MeetingForm
        slug={s.community.slug}
        timezone={s.community.timezone}
        cancelHref={`${base}/meetings/${m.id}`}
        initial={{
          id: m.id,
          title: m.title ?? "",
          meeting_type: m.meeting_type ?? "informal",
          starts_at: utcToZonedInput(m.starts_at, s.community.timezone),
          duration_minutes: String(m.duration_minutes ?? 60),
          location: m.location ?? "",
          meeting_url: m.meeting_url ?? "",
          agenda: m.agenda ?? "",
          status: m.status ?? "scheduled",
        }}
      />
    </div>
  );
}
