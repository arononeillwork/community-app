import Link from "next/link";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { date as fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui";
import { addMonths, daysBetween, relativeDays } from "./dates";

export type TimelineContract = {
  id: string;
  title: string;
  supplier: string;
  notice_deadline: string | null;
  end_date: string | null;
  auto_renew: boolean;
  notice_period_days: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Next 12 months of contract key dates on a month axis: a circle for the notice deadline,
 * a square for the end (or renewal) date, a line for today. Deadlines within 30 days are red.
 * Every marker has a text equivalent for screen readers and a tooltip.
 */
export function KeyDatesTimeline({ contracts, today, hrefBase }: { contracts: TimelineContract[]; today: string; hrefBase: string }) {
  const start = `${today.slice(0, 7)}-01`;
  const end = addMonths(start, 12);
  const span = daysBetween(start, end);
  const pos = (d: string) => (daysBetween(start, d) / span) * 100;
  const inWindow = (d: string | null): d is string => !!d && d >= start && d < end;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const todayPct = pos(today);

  return (
    <div>
      {/* Month axis */}
      <div className="grid gap-x-4 sm:grid-cols-[minmax(0,14rem)_1fr]" aria-hidden>
        <div className="hidden sm:block" />
        <div className="relative grid grid-cols-12 border-b border-line pb-1.5 text-xs text-muted sm:text-[0.8125rem]">
          {months.map((m) => {
            const mi = Number(m.slice(5, 7)) - 1;
            return (
              <div key={m} className="truncate text-center">
                <span className="sm:hidden">{MONTHS[mi][0]}</span>
                <span className="hidden sm:inline">{MONTHS[mi]}</span>
                {mi === 0 && <span className="block text-[0.6875rem] leading-none text-ink-2 sm:text-xs">{m.slice(0, 4)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="divide-y divide-line">
        {contracts.map((c) => {
          const noticeDays = c.notice_deadline ? daysBetween(today, c.notice_deadline) : null;
          const endDays = c.end_date ? daysBetween(today, c.end_date) : null;
          const noticeUrgent = noticeDays != null && noticeDays >= 0 && noticeDays <= 30;
          const endUrgent = endDays != null && endDays >= 0 && endDays <= 30;
          const barEnd = c.end_date ? Math.min(100, Math.max(0, pos(c.end_date))) : 100;
          const endWord = c.auto_renew ? "Renews" : "Ends";

          const summary = [
            c.notice_deadline
              ? noticeDays! >= 0
                ? `Notice deadline ${fmtDate(c.notice_deadline)}, ${relativeDays(noticeDays!)}.`
                : `Notice deadline passed on ${fmtDate(c.notice_deadline)}.`
              : `Rolling contract, ${c.notice_period_days} days' notice.`,
            c.end_date ? `${endWord} ${fmtDate(c.end_date)}, ${relativeDays(endDays!)}.` : "",
          ].join(" ");

          return (
            <li key={c.id} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center">
              <div className="min-w-0">
                <Link href={`${hrefBase}/${c.id}`} title={c.title} className="line-clamp-2 font-medium leading-snug text-ink no-underline hover:underline">{c.title}</Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="truncate" title={c.supplier}>{c.supplier}</span>
                  {noticeUrgent && <Badge tone="bad">Notice {relativeDays(noticeDays!)}</Badge>}
                  {!noticeUrgent && endUrgent && <Badge tone="warn">{endWord} {relativeDays(endDays!)}</Badge>}
                </div>
                <p className="sr-only">{summary}</p>
              </div>

              <div className="relative h-8" aria-hidden>
                {/* month grid */}
                <div className="absolute inset-0 grid grid-cols-12">
                  {months.map((m, i) => <div key={m} className={clsx(i > 0 && "border-l border-line/70")} />)}
                </div>
                {/* remaining term */}
                <div className={clsx("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full",
                    c.end_date ? "bg-brand-soft" : "bg-gradient-to-r from-brand-soft to-transparent")}
                  style={{ left: `${todayPct}%`, width: `${Math.max(0, barEnd - todayPct)}%` }} />
                {/* today */}
                <div className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${todayPct}%` }} />

                {inWindow(c.notice_deadline) && (
                  <span title={`Notice deadline: ${fmtDate(c.notice_deadline)} (${relativeDays(noticeDays!)})`}
                    className={clsx("absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 ring-surface",
                      noticeUrgent ? "size-4 bg-bad" : noticeDays! < 0 ? "size-3 bg-muted/60" : "size-3.5 bg-warn")}
                    style={{ left: `${pos(c.notice_deadline)}%` }} />
                )}
                {inWindow(c.end_date) && (
                  <span title={`${endWord}: ${fmtDate(c.end_date)} (${relativeDays(endDays!)})`}
                    className={clsx("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] ring-2 ring-surface",
                      endUrgent ? "bg-bad" : c.auto_renew ? "bg-info" : "bg-ink-2")}
                    style={{ left: `${pos(c.end_date)}%` }} />
                )}
                {(!c.end_date || c.end_date >= end) && (
                  <span title={c.end_date ? `${endWord}: ${fmtDate(c.end_date)}` : "Rolling contract, no end date"}
                    className="absolute -right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-surface text-muted">
                    <ChevronRight className="size-4" />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-sm text-muted" aria-hidden>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-warn" /> Notice deadline</span>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-[3px] bg-ink-2" /> Ends</span>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-[3px] bg-info" /> Renews automatically</span>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-bad" /> Within 30 days</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-px bg-ink/40" /> Today</span>
      </div>
    </div>
  );
}
