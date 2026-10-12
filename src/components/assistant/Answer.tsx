"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle, BookOpen, CalendarDays, CircleHelp, Coins, Contact, FileText, MapPin, PiggyBank, Sparkles, Trash2,
  Users, Wrench, type LucideIcon,
} from "lucide-react";
import type { ChatMessage, PendingReport, SourceKind } from "@/lib/assistant/types";
import { Avatar } from "@/components/ui";
import { ContactActions } from "@/components/contact";
import PendingReportCard from "./PendingReportCard";
import RichText from "./RichText";

const SOURCE_ICONS: Record<SourceKind, LucideIcon> = {
  info: BookOpen, faq: CircleHelp, bins: Trash2, document: FileText, meeting: CalendarDays, contacts: Contact,
  members: Users, local: MapPin, report: AlertTriangle, reports: AlertTriangle, money: PiggyBank, finance: Coins, admin: Wrench,
};

export function AssistantMark() {
  return (
    <span aria-hidden className="mt-0.5 hidden size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text sm:grid">
      <Sparkles className="size-4" />
    </span>
  );
}

/** One assistant answer: text (or intro + short answer cards), contact buttons, a drafted report, source links. */
export default function Answer({ message, slug }: { message: ChatMessage; slug: string }) {
  const base = `/${slug}`;
  const meta = message.meta;
  const es = meta?.lang === "es";
  const cards = meta?.cards ?? [];
  // A contact that is the subject of a card (the pharmacy, the health centre) gets its buttons inside that
  // card instead of a second box repeating its name.
  const cardContact = cards.map((c) => (meta?.contacts ?? []).find((k) => k.name === c.title && (k.phone || k.whatsapp || k.email)) ?? null);
  const contacts = (meta?.contacts ?? []).filter((k) => !cardContact.includes(k));
  const sources = meta?.sources ?? [];
  const [pending, setPending] = useState<PendingReport | undefined>(meta?.pending);
  const intro = cards.length || meta?.contacts?.length || pending ? meta?.intro ?? message.content : message.content;
  // Once a drafted report is sent or cancelled, "Check it, then press Confirm and send" no longer applies:
  // the card below says what happened.
  const lead = pending && pending.status !== "pending" && meta?.engine === "retrieval" ? "" : intro;

  return (
    <div className="flex gap-3">
      <AssistantMark />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{es ? "Asistente:" : "Assistant:"}</span>
        <div className="break-words rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-ink shadow-card sm:px-5">
          {lead && <RichText text={lead} base={base} />}

          {cards.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {cards.map((c, i) => {
                const k = cardContact[i];
                return (
                  <li key={i} className="rounded-xl bg-surface-2 px-4 py-3">
                    <h3 className="text-[0.9375rem] font-medium text-ink">{c.title}</h3>
                    <RichText text={c.body} base={base} className="mt-1 space-y-1.5 text-[0.9375rem] text-ink-2" />
                    {k && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {k.phone && <span className="tabular text-[0.9375rem] text-ink-2">{k.phone}</span>}
                        <ContactActions name={k.name} phone={k.phone} whatsapp={k.whatsapp} email={k.email} variant="buttons" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {pending && <PendingReportCard slug={slug} pending={pending} es={es} onChange={setPending} className={lead || cards.length ? "mt-3" : ""} />}

          {contacts.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {contacts.map((c, i) => (
                <li key={`${c.name}-${i}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      {c.role && <div className="truncate text-sm text-muted">{c.role}</div>}
                      <div className="truncate font-medium text-ink">{c.name}</div>
                      {(c.phone || c.hours) && (
                        <div className="text-sm text-muted">
                          {c.phone && <span className="tabular">{c.phone}</span>}
                          {c.phone && c.hours && " · "}
                          {c.hours}
                        </div>
                      )}
                    </div>
                  </div>
                  {(c.phone || c.whatsapp || c.email)
                    ? <ContactActions name={c.name} phone={c.phone} whatsapp={c.whatsapp} email={c.email} variant="buttons" />
                    : <span className="text-sm text-muted">{es ? "No comparte sus datos" : "Details kept private"}</span>}
                </li>
              ))}
            </ul>
          )}

        </div>

        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-sm text-muted">{es ? "Fuentes" : "Sources"}</span>
            {sources.map((s, i) => {
              const Icon = SOURCE_ICONS[s.kind] ?? BookOpen;
              const inner = <><Icon aria-hidden className="size-3.5 shrink-0" /><span className="truncate">{s.label}</span></>;
              const cls = "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 no-underline";
              return s.href
                ? <Link key={i} href={`${base}${s.href}`} className={`${cls} transition-colors hover:border-brand-line hover:text-ink`}>{inner}</Link>
                : <span key={i} className={cls}>{inner}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
