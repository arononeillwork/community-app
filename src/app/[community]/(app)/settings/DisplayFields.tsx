"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { ChoiceCard, FieldGroup, Toggle } from "@/components/me/fields";
import { LANGUAGE_NAMES, SCALES, THEMES } from "./options";

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

type Prefs = { font_scale: number; theme: string; high_contrast: boolean; dyslexia_font: boolean; reduce_motion: boolean; language: string };

/** Fields of the "Reading and display" card, with a live preview of the chosen text size. */
export default function DisplayFields({ prefs, languages, currentScale }: { prefs: Prefs; languages: string[]; currentScale: number }) {
  const [scale, setScale] = useState(prefs.font_scale);
  // The page is already drawn at the current size, so scale the preview relative to it.
  const previewSize = `${((1.0625 * scale) / currentScale).toFixed(4)}rem`;

  return (
    <>
      <FieldGroup legend="Text size">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,3.5rem),1fr))] gap-2">
          {SCALES.map((v) => (
            <label key={v}
              className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface px-1 py-2 transition-colors hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[color:var(--focus)]">
              <input type="radio" name="font_scale" value={v} checked={scale === v} onChange={() => setScale(v)} className="sr-only" />
              <span aria-hidden className="font-medium leading-none text-ink" style={{ fontSize: `${0.85 + ((v - 100) / 100) * 0.7}rem` }}>A</span>
              <span className="whitespace-nowrap text-sm text-muted tabular">{v}%</span>
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line" aria-live="polite">
          <p className="text-sm text-muted">Preview at {scale}%</p>
          <p className="mt-1 leading-snug text-ink" style={{ fontSize: previewSize }}>
            The pool is open from 10:00 to 20:00 until the end of October.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup legend="Colours">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
          {THEMES.map((t) => (
            <ChoiceCard key={t.value} name="theme" value={t.value} label={t.label} icon={THEME_ICONS[t.value]}
              defaultChecked={(prefs.theme || "light") === t.value} />
          ))}
        </div>
      </FieldGroup>

      <div className="divide-y divide-line">
        <Toggle name="high_contrast" label="High contrast" description="Black text on white, with stronger borders." defaultChecked={prefs.high_contrast} />
        <Toggle name="dyslexia_font" label="Dyslexia-friendly font" description="A rounder font with more space between letters." defaultChecked={prefs.dyslexia_font} />
        <Toggle name="reduce_motion" label="Reduce motion" description="Turns off animations and sliding effects." defaultChecked={prefs.reduce_motion} />
      </div>

      <div className="field sm:max-w-xs">
        <label htmlFor="language">Language</label>
        <select id="language" name="language" className="input" defaultValue={languages.includes(prefs.language) ? prefs.language : languages[0]}>
          {languages.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l] ?? l}</option>)}
        </select>
        <p className="hint">Used for documents and the assistant&apos;s answers.</p>
      </div>
    </>
  );
}
