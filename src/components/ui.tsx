import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={clsx("card rounded-card border border-line bg-surface p-5 sm:p-6", className)}>{children}</As>;
}

type BtnProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  name?: string;
  value?: string;
  disabled?: boolean;
  external?: boolean;
};

export function Button({ children, href, variant = "primary", size = "md", className, type = "button", external, ...rest }: BtnProps) {
  const cls = clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold no-underline transition-colors disabled:opacity-50",
    size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-12 px-5",
    variant === "primary" && "bg-brand text-brand-ink hover:brightness-110",
    variant === "secondary" && "border-2 border-line-strong bg-surface text-ink hover:bg-bg",
    variant === "danger" && "bg-bad text-white hover:brightness-110",
    variant === "ghost" && "text-ink hover:bg-bg",
    className,
  );
  if (href) {
    return external ? (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{children}</a>
    ) : (
      <Link href={href} className={cls}>{children}</Link>
    );
  }
  return <button type={type} className={cls} {...rest}>{children}</button>;
}

const TONES = {
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-bad-soft text-bad border-bad/30",
  info: "bg-info-soft text-info border-info/30",
  neutral: "bg-bg text-muted border-line",
} as const;
export type Tone = keyof typeof TONES;

/** Status is always colour + word, never colour alone. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full border px-3 py-0.5 text-sm font-bold", TONES[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, intro, actions, back }: { title: string; intro?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="no-print inline-flex w-fit items-center gap-1 rounded-lg py-1 text-base font-bold text-brand hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold leading-tight">{title}</h1>
          {intro && <p className="mt-1 max-w-3xl text-muted">{intro}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const inner = (
    <>
      <div className="text-base font-bold text-muted">{label}</div>
      <div className={clsx("tabular mt-1 text-3xl font-bold", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
    </>
  );
  const cls = "card block rounded-card border border-line bg-surface p-5 no-underline text-ink";
  return href ? <Link href={href} className={clsx(cls, "hover:border-brand")}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border-2 border-dashed border-line bg-surface p-8 text-center">
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div role="status" className={clsx("rounded-xl border-2 px-4 py-3 font-bold", TONES[tone])}>{children}</div>;
}

export const STATUS_TONES: Record<string, Tone> = {
  paid: "ok", approved: "info", received: "warn", disputed: "bad",
  new: "warn", acknowledged: "info", in_progress: "info", resolved: "ok", closed: "neutral",
  active: "ok", pending: "warn", ended: "neutral", cancelled: "bad",
  scheduled: "info", postponed: "warn", held: "neutral",
  open: "info", on_agenda: "ok", discussed: "neutral", declined: "neutral",
  unpaid: "bad", partial: "warn",
  low: "neutral", normal: "info", high: "warn", urgent: "bad",
  incident: "bad", complaint: "info",
  overdue: "bad", due_soon: "warn", ok: "ok",
  rolling: "info", on_track: "ok", near_limit: "warn", over: "bad", inactive: "neutral", draft: "neutral",
  not_due_yet: "info",
};

export const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress", on_agenda: "On agenda", not_attending: "Not attending",
  long_term: "Long-term", short_term: "Short-term", holiday_let: "Holiday let", common_area: "Common area",
  due_soon: "Due soon", agm: "AGM",
  received: "Awaiting approval", ok: "OK", on_track: "On track", near_limit: "Near limit", over: "Over budget",
  one_off: "One-off", not_due_yet: "Not due yet",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <Badge tone={STATUS_TONES[value] ?? "neutral"}>{STATUS_LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
