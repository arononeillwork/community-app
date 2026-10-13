import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, Info, TriangleAlert, type LucideIcon } from "lucide-react";

/* ---------------------------------------------------------------------------
   Building blocks shared by every page. Keep pages calm: one card per idea,
   regular-weight body text, semibold only for titles and key numbers.
   --------------------------------------------------------------------------- */

export function Card({ children, className, as: As = "section", padded = true }: {
  children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li"; padded?: boolean;
}) {
  return (
    <As className={clsx("card rounded-card border border-line bg-surface shadow-card", padded && "p-5 sm:p-6", className)}>
      {children}
    </As>
  );
}

/** Title row inside a card: optional icon, title, one-line description, action on the right. */
export function SectionHeader({ title, description, icon: Icon, action, as: As = "h2", className }: {
  title: ReactNode; description?: ReactNode; icon?: LucideIcon; action?: ReactNode; as?: "h2" | "h3"; className?: string;
}) {
  return (
    <div className={clsx("mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="flex min-w-[min(100%,12rem)] flex-1 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
            <Icon aria-hidden className="size-[1.15rem]" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <As className="text-[1.0625rem] font-semibold leading-snug">{title}</As>
          {description && <p className="mt-0.5 text-[0.9375rem] text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type BtnProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  name?: string;
  value?: string;
  disabled?: boolean;
  external?: boolean;
  title?: string;
  "aria-label"?: string;
};

export function buttonClass(variant: BtnProps["variant"] = "primary", size: BtnProps["size"] = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium no-underline transition-colors disabled:pointer-events-none disabled:opacity-50",
    size === "lg" && "min-h-12 px-5 text-base",
    size === "md" && "min-h-11 px-4 text-[0.9375rem]",
    size === "sm" && "min-h-9 px-3 text-sm",
    variant === "primary" && "bg-brand text-brand-ink shadow-card hover:brightness-110",
    variant === "secondary" && "border border-line-strong/60 bg-surface text-ink shadow-card hover:bg-surface-2",
    variant === "soft" && "bg-brand-soft text-brand-text hover:brightness-95",
    variant === "danger" && "bg-bad text-white hover:brightness-110",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    className,
  );
}

export function Button({ children, href, variant = "primary", size = "md", className, type = "button", external, ...rest }: BtnProps) {
  const cls = buttonClass(variant, size, className);
  if (href) {
    return external ? (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" title={rest.title} aria-label={rest["aria-label"]}>{children}</a>
    ) : (
      <Link href={href} className={cls} title={rest.title} aria-label={rest["aria-label"]}>{children}</Link>
    );
  }
  return <button type={type} className={cls} {...rest}>{children}</button>;
}

/** Square icon-only button. Always pass a label: it becomes the accessible name and the tooltip. */
export function IconButton({ icon: Icon, label, href, external, className, type = "button", variant = "ghost" }: {
  icon: LucideIcon; label: string; href?: string; external?: boolean; className?: string; type?: "button" | "submit";
  variant?: "ghost" | "secondary" | "soft";
}) {
  const cls = clsx(
    "inline-grid size-10 shrink-0 place-items-center rounded-[10px] no-underline transition-colors",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "secondary" && "border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "soft" && "bg-brand-soft text-brand-text hover:brightness-95",
    className,
  );
  const icon = <Icon aria-hidden className="size-[1.2rem]" strokeWidth={2} />;
  if (href) {
    return external || /^(tel|mailto|https?):/.test(href)
      ? <a href={href} className={cls} aria-label={label} title={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{icon}</a>
      : <Link href={href} className={cls} aria-label={label} title={label}>{icon}</Link>;
  }
  return <button type={type} className={cls} aria-label={label} title={label}>{icon}</button>;
}

const TONES = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand-text",
  neutral: "bg-surface-2 text-muted ring-1 ring-inset ring-line",
} as const;
export type Tone = keyof typeof TONES;

const DOTS: Record<Tone, string> = {
  ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", brand: "bg-brand", neutral: "bg-muted/60",
};

/** Status is always colour + word, never colour alone. */
export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium leading-5", TONES[tone], className)}>
      {dot && <span aria-hidden className={clsx("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function PageHeader({ title, intro, actions, back, eyebrow }: {
  title: ReactNode; intro?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:mb-8">
      {back && (
        <Link href={back.href} className="no-print -ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-1 text-[0.9375rem] font-medium text-muted no-underline hover:text-ink">
          <ChevronLeft aria-hidden className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-sm font-medium text-brand-text">{eyebrow}</div>}
          <h1 className="text-[1.625rem] font-semibold leading-tight sm:text-[1.875rem]">{title}</h1>
          {intro && <p className="mt-1.5 max-w-2xl text-[1rem] text-muted">{intro}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, href, icon: Icon }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string; icon?: LucideIcon;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-muted">{label}</div>
        {Icon && <Icon aria-hidden className="size-4 text-muted" />}
      </div>
      <div className={clsx("tabular mt-2 text-[1.75rem] font-semibold leading-none tracking-tight",
        tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</div>
      {sub && <div className="mt-2 text-sm text-muted">{sub}</div>}
    </>
  );
  const cls = "card block rounded-card border border-line bg-surface p-5 text-ink no-underline shadow-card";
  return href ? <Link href={href} className={clsx(cls, "transition-colors hover:border-brand-line")}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function Empty({ title, children, icon: Icon, action }: { title: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-[0.9375rem] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const NOTICE_ICONS: Record<Tone, LucideIcon> = { ok: CheckCircle2, warn: TriangleAlert, bad: AlertCircle, info: Info, brand: Info, neutral: Info };

export function Notice({ tone = "info", children, title }: { tone?: Tone; children: ReactNode; title?: ReactNode }) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div role="status" className={clsx("flex gap-3 rounded-xl px-4 py-3 text-[0.9375rem]", TONES[tone])}>
      <Icon aria-hidden className="mt-0.5 size-[1.15rem] shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className={clsx(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

/* Avatars: initials on a soft, name-derived colour. */
const AVATAR_HUES = [168, 200, 222, 262, 292, 330, 12, 32, 88, 140];
export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
export function Avatar({ name, size = "md", className }: { name: string | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return (
    <span aria-hidden
      className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold",
        size === "sm" && "size-8 text-xs", size === "md" && "size-10 text-sm", size === "lg" && "size-12 text-base", className)}
      style={{ background: `hsl(${hue} 70% 93%)`, color: `hsl(${hue} 45% 30%)` }}>
      {initials(name)}
    </span>
  );
}

/** Label / value rows. */
export function DefinitionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-6">
          <dt className="shrink-0 text-[0.9375rem] text-muted sm:w-40">{it.label}</dt>
          <dd className="min-w-0 text-[0.9375rem] text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pill tabs for switching between sibling pages or filters (links, so they work without JS). */
export function TabLinks({ tabs, label }: { tabs: { href: string; label: ReactNode; active?: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-print -mx-1 mb-6 flex flex-wrap gap-1 px-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={clsx("inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.9375rem] font-medium no-underline transition-colors",
            t.active ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface hover:text-ink")}>
          {t.label}
          {t.count != null && (
            <span className={clsx("rounded-full px-1.5 text-xs tabular", t.active ? "bg-surface/20" : "bg-surface-2 text-muted ring-1 ring-line")}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
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
  draft: "neutral", done: "ok",
};

export const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress", on_agenda: "On agenda", not_attending: "Not attending", received: "Awaiting approval",
  long_term: "Long-term", short_term: "Short-term", holiday_let: "Holiday let", common_area: "Common area",
  due_soon: "Due soon", agm: "AGM",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <Badge tone={STATUS_TONES[value] ?? "neutral"}>{STATUS_LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
