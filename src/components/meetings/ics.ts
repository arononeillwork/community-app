import { agendaItems } from "./meeting-utils";

/* iCalendar (RFC 5545) builder for one meeting. */

export type IcsMeeting = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  agenda: string | null;
  status: string;
};

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function icsEscape(v: string) {
  return v.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold a content line at 75 octets (UTF-8), never splitting a character. Continuation lines start with a space. */
export function icsFold(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** 2026-11-26T17:00:00.000Z → 20261126T170000Z */
export function icsUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(m: IcsMeeting, opts: { pageUrl: string; host: string; communityName: string; now?: Date }) {
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + m.duration_minutes * 60000);
  const items = agendaItems(m.agenda);

  const description = [
    items.length ? `Agenda:\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
    m.meeting_url ? `Join online: ${m.meeting_url}` : "",
    `Details and RSVP: ${opts.pageUrl}`,
  ].filter(Boolean).join("\n\n");

  const location = m.location ?? (m.meeting_url ? "Online" : null);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsEscape(opts.communityName)}//Meetings//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@${opts.host}`,
    `DTSTAMP:${icsUtc(opts.now ?? new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(m.title)}`,
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    `URL:${m.meeting_url ?? opts.pageUrl}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `STATUS:${m.status === "cancelled" ? "CANCELLED" : m.status === "postponed" ? "TENTATIVE" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** "Annual General Meeting 2026" → "annual-general-meeting-2026.ics" */
export function icsFilename(title: string) {
  const base = title
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/, "");
  return `${base || "meeting"}.ics`;
}
