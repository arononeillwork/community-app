"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border-2 border-line bg-surface p-1" role="group" aria-label="Text size">
        <button type="button" onClick={() => changeSize(-1)} disabled={size === SIZES[0]}
          className="min-h-11 min-w-11 rounded-lg px-2 text-base font-bold hover:bg-bg disabled:opacity-40" aria-label="Smaller text">A−</button>
        <span className="px-1 text-sm font-bold tabular" aria-live="polite">{size}%</span>
        <button type="button" onClick={() => changeSize(1)} disabled={size === SIZES[SIZES.length - 1]}
          className="min-h-11 min-w-11 rounded-lg px-2 text-xl font-bold hover:bg-bg disabled:opacity-40" aria-label="Larger text">A+</button>
      </div>
      {languages.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="sr-only">Language</span>
          <select className="input w-auto min-h-12" value={current}
            onChange={(e) => { setCookie("lang", e.target.value); router.refresh(); }}>
            {languages.map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
