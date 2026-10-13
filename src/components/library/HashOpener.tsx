"use client";

import { useEffect } from "react";

/** When the page is opened with #some-id (e.g. from an assistant answer), open that <details> and bring it into view. */
export default function HashOpener() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: "start" });
      el.querySelector<HTMLElement>("summary, a, button")?.focus({ preventScroll: true });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
