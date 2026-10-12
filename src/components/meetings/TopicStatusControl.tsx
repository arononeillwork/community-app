"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";

export type AgendaMeeting = { id: string; label: string };

/** Admin control: Open / On the agenda for <meeting> / Discussed / Declined. A Save button appears once changed. */
export function TopicStatusControl({ topicId, title, status, meetingId, meetings, action }: {
  topicId: string;
  title: string;
  status: string;
  meetingId: string | null;
  meetings: AgendaMeeting[];
  action: (fd: FormData) => Promise<{ error?: string }>;
}) {
  const initial = status === "on_agenda" && meetingId ? `on_agenda:${meetingId}` : status;
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const [st, mid] = value.split(":");
    const fd = new FormData();
    fd.set("status", st);
    if (mid) fd.set("meeting_id", mid);
    setError(null);
    start(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else setSaved(value);
    });
  }

  const id = `topic-status-${topicId}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 sm:flex-none">
          <label htmlFor={id} className="shrink-0 text-sm text-muted">
            Status<span className="sr-only"> of “{title}”</span>
          </label>
          <select id={id} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending}
            className="input !min-h-9 !w-auto min-w-0 flex-1 !rounded-full !border-transparent !bg-surface-2 !py-1 !pl-3 !text-sm text-ink-2 hover:!border-line focus:!border-brand sm:max-w-xs sm:flex-none">
            <option value="open">Open for votes</option>
            {meetings.map((m) => <option key={m.id} value={`on_agenda:${m.id}`}>On the agenda: {m.label}</option>)}
            <option value="discussed">Discussed</option>
            <option value="declined">Declined</option>
          </select>
        </div>
        {value !== saved && (
          <button type="button" onClick={save} disabled={pending} className={buttonClass("soft", "sm")}>
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
