/**
 * Minimal RFC 5545 (iCalendar) writer for a single meeting.
 * - CRLF line endings
 * - TEXT values escaped (backslash, semicolon, comma, newlines)
 * - content lines folded at 75 octets (UTF-8 safe: never splits a character)
 */

export type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  /** Minutes before the start for a reminder alarm (omit for none). */
  alarmMinutes?: number[];
  /** When the meeting was last changed (LAST-MODIFIED). */
  lastModified?: Date | null;
  /** Revision number; must grow with each change so calendar apps replace the old copy (SEQUENCE). */
  sequence?: number | null;
};

/** Escape a TEXT property value (RFC 5545 §3.3.11). */
export function escapeText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** UTC date-time in basic format: 20261011T180000Z */
export function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const encoder = new TextEncoder();

/** Fold a content line so no physical line exceeds 75 octets (continuations start with one space). */
export function foldLine(line: string) {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts as one octet
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** URI values are not TEXT-escaped, but must not contain control characters or spaces. */
function uriValue(url: string) {
  return url.replace(/[\u0000- \u007F]/g, "");
}

export function buildIcs(ev: IcsEvent) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Community App//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uriValue(ev.uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
  ];
  if (ev.lastModified && !Number.isNaN(ev.lastModified.getTime())) lines.push(`LAST-MODIFIED:${icsDate(ev.lastModified)}`);
  if (ev.sequence != null && Number.isFinite(ev.sequence) && ev.sequence >= 0) lines.push(`SEQUENCE:${Math.floor(ev.sequence)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.url) lines.push(`URL:${uriValue(ev.url)}`);
  lines.push(`STATUS:${ev.status ?? "CONFIRMED"}`);
  if (ev.status !== "CANCELLED") {
    for (const minutes of ev.alarmMinutes ?? []) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`Reminder: ${ev.title}`)}`,
        `TRIGGER:-PT${Math.max(0, Math.round(minutes))}M`,
        "END:VALARM",
      );
    }
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
