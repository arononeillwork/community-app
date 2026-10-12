import "server-only";
import type { Session } from "@/lib/community";
import { moneyShort } from "@/lib/format";
import type { DB } from "./data";
import type { Lang } from "./types";

/** Everything an answer needs: who is asking, their RLS-bound client, language and the community clock. */
export type AskContext = {
  s: Session;
  db: DB;
  lang: Lang;
  tz: string;
  now: Date;
};

export function locale(lang: Lang) {
  return lang === "es" ? "es-ES" : "en-GB";
}

/** Day of week (0 = Sunday) in the community's time zone, `offset` days from now. */
export function weekdayIn(tz: string, now: Date, offset = 0): number {
  const d = new Date(now.getTime() + offset * 86400000);
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function yearIn(tz: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: tz }).format(now));
}

/** "Thursday 23 October at 18:00" in the community's time zone. */
export function whenText(iso: string, tz: string, lang: Lang): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(d);
  return lang === "es" ? `${day} a las ${time}` : `${day} at ${time}`;
}

export function dateText(iso: string, tz: string, lang: Lang): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(d);
}

/** Whole currency units for summaries ("€10,285"); amounts are integer cents. */
export function euros(cents: number, lang: Lang, currency = "EUR"): string {
  return moneyShort(cents, currency, locale(lang));
}

export const ROLE_NAMES: Record<string, string> = { admin: "Administrator", treasurer: "Treasurer", owner: "Owner", tenant: "Resident" };
