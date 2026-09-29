import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * A plain <a> styled like our Button. Used for tel: links, file downloads and
 * external sites, where next/link client navigation is not wanted.
 */
export default function LinkButton({ href, children, variant = "secondary", size = "md", external, className }: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "lg";
  external?: boolean;
  className?: string;
}) {
  const cls = clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold no-underline transition-colors",
    size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-12 px-5",
    variant === "primary" && "bg-brand text-brand-ink hover:brightness-110",
    variant === "secondary" && "border-2 border-line-strong bg-surface text-ink hover:bg-bg",
    variant === "danger" && "bg-bad text-white hover:brightness-110",
    variant === "ghost" && "text-ink hover:bg-bg",
    className,
  );
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <a href={href} className={cls}>{children}</a>
  );
}
