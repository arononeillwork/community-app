"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Languages } from "lucide-react";

const SIZES = [100, 125, 150, 175, 200];
const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Español", de: "Deutsch", nl: "Nederlands", sv: "Svenska", da: "Dansk", no: "Norsk", fr: "Français",
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Text size + language, usable before signing in (stored in cookies). */
export default function QuickControls({ languages, current }: { languages: string[]; current: string }) {
  const router = useRouter();
  const [size, setSize] = useState(100);

  useEffect(() => {
    const m = document.cookie.match(/a11y_fs=(\d+)/);
    if (m) setSize(Number(m[1]));
  }, []);

  function changeSize(delta: number) {
    const i = Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + delta));
    const next = SIZES[i];
    setSize(next);
    setCookie("a11y_fs", String(next));
    document.documentElement.style.fontSize = `${next}%`;
  }

  const btn = "grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-35";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-[10px] border border-line bg-surface p-0.5" role="group" aria-label="Text size">
        <button type="button" onClick={() => changeSize(-1)} disabled={size === SIZES[0]} className={`${btn} text-sm`} aria-label="Smaller text" title="Smaller text">A</button>
        <span className="sr-only" aria-live="polite">Text size {size}%</span>
        <button type="button" onClick={() => changeSize(1)} disabled={size === SIZES[SIZES.length - 1]} className={`${btn} text-lg font-medium`} aria-label="Larger text" title="Larger text">A</button>
      </div>
      {languages.length > 1 && (
        <label className="relative flex items-center">
          <span className="sr-only">Language</span>
          <Languages aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-muted" />
          <select className="input !min-h-10 w-auto !py-1 !pl-8 text-[0.9375rem]" value={current}
            onChange={(e) => { setCookie("lang", e.target.value); router.refresh(); }}>
            {languages.map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
