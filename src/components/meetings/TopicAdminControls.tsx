"use client";

import { useActionState } from "react";
import { setTopicStatus, type FormState } from "@/app/[community]/(app)/meetings/actions";
import { Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import { buttonClass } from "./meeting-utils";

type MeetingOption = { id: string; label: string };

/** Admin controls on one suggested topic: agenda / discussed / decline / reopen. */
export default function TopicAdminControls({
  slug, topicId, status, meetingId, meetings, adminNote,
}: {
  slug: string;
  topicId: string;
  status: string;
  meetingId: string | null;
  meetings: MeetingOption[];
  adminNote: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(setTopicStatus.bind(null, slug, topicId), undefined);
  const selectId = `agenda-${topicId}`;
  const noteId = `note-${topicId}`;
  const canPlan = status === "open" || status === "on_agenda";
  const currentOnList = meetingId && meetings.some((m) => m.id === meetingId) ? meetingId : "";

  return (
    <div className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      {canPlan && (
        meetings.length > 0 ? (
          <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="status" value="on_agenda" />
            <div className="field flex-1">
              <label htmlFor={selectId}>{status === "on_agenda" ? "Move to the agenda of" : "Put on the agenda of"}</label>
              <select id={selectId} name="meeting_id" className="input" required defaultValue={currentOnList}>
                <option value="" disabled>Choose an upcoming meeting</option>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <SubmitButton className={buttonClass("primary")} pendingLabel="Saving…">
              {status === "on_agenda" ? "Move" : "Put on the agenda"}
            </SubmitButton>
          </form>
        ) : (
          <p className="hint">To put this topic on an agenda, first plan an upcoming meeting.</p>
        )
      )}

      <div className="flex flex-wrap gap-2">
        {canPlan && (
          <form action={action}>
            <input type="hidden" name="status" value="discussed" />
            <SubmitButton className={buttonClass("secondary")} pendingLabel="Saving…">Mark as discussed</SubmitButton>
          </form>
        )}
        {status !== "open" && (
          <form action={action}>
            <input type="hidden" name="status" value="open" />
            <SubmitButton className={buttonClass("secondary")} pendingLabel="Saving…">Reopen for support</SubmitButton>
          </form>
        )}
      </div>

      {status !== "declined" && (
        <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="status" value="declined" />
          <div className="field flex-1">
            <label htmlFor={noteId}>Reason for declining <span className="font-normal text-muted">(optional, shown to everyone)</span></label>
            <input id={noteId} name="admin_note" maxLength={1000} className="input" defaultValue={adminNote ?? ""}
              placeholder="e.g. Already covered by the new garden contract" />
          </div>
          <SubmitButton className={buttonClass("secondary")} pendingLabel="Saving…">Decline</SubmitButton>
        </form>
      )}
    </div>
  );
}
