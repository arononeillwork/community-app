"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps the result notice shown after a form redirects back (e.g. "Payment recorded").
 * Next.js keeps the scroll position when only part of the page changes, so the notice could
 * land above the top of the screen; this brings it into view once when it appears.
 */
export function Flash({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center" });
  }, []);
  return <div ref={ref} className="flex flex-col gap-3">{children}</div>;
}
