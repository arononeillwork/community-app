/**
 * Small, pure helpers for the Meetings area (usable from server and client components).
 * Meetings are only announced and tracked here; they take place in person or on an external
 * Zoom / Teams / Meet link.
 */
import type { Tone } from "@/components/ui";

export type MeetingType = "agm" | "extraordinary" | "committee" | "informal";
export type MeetingStatus = "scheduled" | "postponed" | "cancelled" | "held";
export type RsvpResponse = "attending" | "online" | "not_attending";
export type TopicStatus = "open" | "on_agenda" | "discussed" | "declined";

export const MEETING_TYPES: { value: MeetingType; label: string; short: string; help: string; tone: Tone }[] = [
  {
    value: "agm", label: "Annual General Meeting (AGM)", short: "AGM", tone: "info",
    help: "The yearly meeting of all owners. The accounts (what was spent) and the budget (the spending plan for next year) are approved here.",
  },
  {
    value: "extraordinary", label: "Extraordinary meeting", short: "Extraordinary meeting", tone: "warn",
    help: "A special meeting of all owners, called for an urgent or important decision.",
  },
  {
    value: "committee", label: "Committee meeting", short: "Committee meeting", tone: "neutral",
    help: "A meeting of the committee: the owners elected to help run the community.",
  },
  {
    value: "informal", label: "Informal meeting", short: "Informal meeting", tone: "neutral",
    help: "A get-together or information session. There are no formal votes.",
  },
];

export function meetingType(value: string | null | undefined) {
  return MEETING_TYPES.find((t) => t.value === value) ?? MEETING_TYPES[3];
}

export const MEETING_STATUSES: { value: MeetingStatus; label: string; help: string }[] = [
  { value: "scheduled", label: "Scheduled", help: "going ahead as planned" },
  { value: "postponed", label: "Postponed", help: "moved to a later date that is not fixed yet" },
  { value: "cancelled", label: "Cancelled", help: "not happening" },
  { value: "held", label: "Held", help: "the meeting has taken place" },
];

export const RSVP_OPTIONS: { value: RsvpResponse; label: string; mine: string }[] = [
  { value: "attending", label: "Attending", mine: "You will attend in person" },
  { value: "online", label: "Joining online", mine: "You will join online" },
  { value: "not_attending", label: "Not attending", mine: "You will not attend" },
];

export function rsvpLabel(value: string | null | undefined) {
  return RSVP_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

export const TOPIC_TABS: { value: TopicStatus; label: string; empty: string }[] = [
  { value: "open", label: "Open", empty: "No open topics. Be the first to suggest one!" },
  { value: "on_agenda", label: "On agenda", empty: "No topics are on a meeting agenda yet." },
  { value: "discussed", label: "Discussed", empty: "No topics have been discussed yet." },
  { value: "declined", label: "Declined", empty: "No topics have been declined." },
];

/** Only allow http(s) links to be rendered or exported (never javascript: etc.). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** "Zoom", "Microsoft Teams", "Google Meet"… from a meeting link, for plain-language button hints. */
export function providerName(url: string | null | undefined): string | null {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const host = new URL(safe).hostname.toLowerCase();
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host.includes("teams.microsoft") || host.includes("teams.live")) return "Microsoft Teams";
  if (host === "meet.google.com") return "Google Meet";
  if (host.endsWith("webex.com")) return "Webex";
  if (host.endsWith("whereby.com")) return "Whereby";
  if (host.endsWith("jit.si")) return "Jitsi";
  return null;
}

export function endMs(startsAt: string, durationMinutes: number | null | undefined) {
  return new Date(startsAt).getTime() + (Number(durationMinutes) || 60) * 60_000;
}

/** Upcoming = not held and not finished yet (cancelled ones are still shown so people see the change). */
export function isUpcoming(m: { starts_at: string; duration_minutes: number | null; status: string }, now = Date.now()) {
  return m.status !== "held" && endMs(m.starts_at, m.duration_minutes) >= now;
}

function zonedParts(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
}

/** UTC ISO string → "YYYY-MM-DDTHH:mm" wall-clock time in the zone (for <input type="datetime-local"> defaults). */
export function utcToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = zonedParts(d, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Calendar day "YYYY-MM-DD" of an instant in the zone. */
export function dayKey(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "20:00" in the zone. */
export function timeOnly(iso: string | number | Date, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** "Today", "Tomorrow", "In 5 days" (community calendar days); null for the past. */
export function relativeDay(iso: string, timeZone: string, now = new Date()): string | null {
  const days = Math.round((Date.parse(dayKey(iso, timeZone)) - Date.parse(dayKey(now, timeZone))) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function durationLabel(minutes: number | null | undefined) {
  const m = Number(minutes) || 60;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = rest ? `${rest} minutes` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

type CalMeeting = {
  title: string;
  starts_at: string;
  duration_minutes: number | null;
  location: string | null;
  meeting_url: string | null;
  agenda: string | null;
};

/** Plain-text description used in calendar entries: agenda, then the join link and the details page. */
export function calendarDescription(m: CalMeeting, detailsUrl?: string) {
  const join = safeHttpUrl(m.meeting_url);
  return [
    m.agenda ? `Agenda:\n${m.agenda}` : "",
    join ? `Join online: ${join}` : "",
    detailsUrl ? `Details: ${detailsUrl}` : "",
  ].filter(Boolean).join("\n\n");
}

function compactUtc(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Google Calendar "add event" link. */
export function googleCalendarUrl(m: CalMeeting, detailsUrl?: string) {
  const start = new Date(m.starts_at).getTime();
  const end = endMs(m.starts_at, m.duration_minutes);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${compactUtc(start)}/${compactUtc(end)}`,
    details: calendarDescription(m, detailsUrl).slice(0, 1500),
    location: m.location ?? safeHttpUrl(m.meeting_url) ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Absolute origin of the current request (honours proxies / custom domains). */
export function originFrom(h: { get(name: string): string | null }) {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** Same look as <Button> from the UI kit, for elements Button cannot render (download links, submit buttons with state). */
export function buttonClass(variant: "primary" | "secondary" | "danger" | "ghost" = "primary", size: "md" | "lg" = "md") {
  return [
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold no-underline transition-colors disabled:opacity-50",
    size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-12 px-5",
    variant === "primary" ? "bg-brand text-brand-ink hover:brightness-110" : "",
    variant === "secondary" ? "border-2 border-line-strong bg-surface text-ink hover:bg-bg" : "",
    variant === "danger" ? "bg-bad text-white hover:brightness-110" : "",
    variant === "ghost" ? "text-ink hover:bg-bg" : "",
  ].filter(Boolean).join(" ");
}
