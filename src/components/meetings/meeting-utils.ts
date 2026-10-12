import type { Tone } from "@/components/ui";

/* Pure helpers shared by the meetings pages, forms and the .ics route (safe on server and client). */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MEETING_TYPES = [
  { value: "agm", label: "AGM", long: "Annual general meeting (AGM)" },
  { value: "extraordinary", label: "Extraordinary", long: "Extraordinary meeting" },
  { value: "committee", label: "Committee", long: "Committee meeting" },
  { value: "informal", label: "Informal", long: "Informal get-together" },
] as const;

export const MEETING_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "postponed", label: "Postponed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "held", label: "Held (has taken place)" },
] as const;

export const RSVP_OPTIONS = [
  { value: "attending", label: "Attending in person", short: "In person" },
  { value: "online", label: "Joining online", short: "Online" },
  { value: "not_attending", label: "Not attending", short: "Not coming" },
] as const;

export type RsvpResponse = (typeof RSVP_OPTIONS)[number]["value"];

export const TOPIC_STATUSES = ["open", "on_agenda", "discussed", "declined"] as const;

const TYPE_TONES: Record<string, Tone> = { agm: "brand", extraordinary: "info", committee: "neutral", informal: "neutral" };

export function typeLabel(t: string | null | undefined) {
  return MEETING_TYPES.find((x) => x.value === t)?.label ?? "Meeting";
}

export function typeTone(t: string | null | undefined): Tone {
  return TYPE_TONES[t ?? ""] ?? "neutral";
}

export function rsvpLabel(r: string | null | undefined) {
  return RSVP_OPTIONS.find((x) => x.value === r)?.label ?? "";
}

/** Format a moment in the community's time zone (en-GB). */
export function inZone(d: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(new Date(d));
}

/** "18:00–20:00" in the community's time zone. */
export function timeRange(startsAt: string, minutes: number, timeZone: string) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const t = (x: Date) => inZone(x, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${t(start)}–${t(end)}`;
}

/** "Thursday 26 November 2026" in the community's time zone. */
export function longDate(startsAt: string, timeZone: string) {
  return inZone(startsAt, timeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "1 hour 30 min", "2 hours", "45 min". */
export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m ? `${m} min` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 min";
}

/** "Madrid time": the zone's city, for forms where the date (and so summer/winter time) can change. */
export function zoneName(timeZone: string) {
  return `${(timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")} time`;
}

/** "Madrid time (CEST)": the zone's city plus its abbreviation on a given date. */
export function zoneLabel(timeZone: string, at: string | Date = new Date()) {
  const city = (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
  const abbr = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value;
  return abbr && !/^GMT[+-]/.test(abbr) ? `${city} time (${abbr})` : `${city} time`;
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" wall-clock in a zone, for <input type="datetime-local">. */
export function toLocalInput(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso)).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Agenda text → items. Strips typed numbering or bullets ("1.", "2)", "-", "•"). */
export function agendaItems(text: string | null | undefined) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(\d+[.)]|[-–•*])\s*/, "").trim())
    .filter(Boolean);
}

/** One entry per non-empty line. */
export function lines(text: string | null | undefined) {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Has the meeting finished (start + duration in the past)? */
export function hasEnded(m: { starts_at: string; duration_minutes: number }, now = Date.now()) {
  return new Date(m.starts_at).getTime() + m.duration_minutes * 60000 < now;
}

/** Has the meeting started? */
export function hasStarted(m: { starts_at: string }, now = Date.now()) {
  return new Date(m.starts_at).getTime() <= now;
}

/** Friendly age: "today", "yesterday", "5 days ago", "3 weeks ago", "2 months ago". */
export function ago(iso: string, now = Date.now()) {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** Is this a usable http(s) link? */
export function isWebUrl(v: string) {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** "Zoom", "Microsoft Teams", "Google Meet", or the link's host name. */
export function providerName(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("zoom.us")) return "Zoom";
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Microsoft Teams";
    if (host === "meet.google.com") return "Google Meet";
    if (host.endsWith("webex.com")) return "Webex";
    if (host.endsWith("whereby.com")) return "Whereby";
    return host;
  } catch {
    return "a video call";
  }
}
