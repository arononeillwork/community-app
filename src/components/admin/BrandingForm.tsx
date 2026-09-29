"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ImageUp, Save } from "lucide-react";
import { inkFor } from "@/lib/color";
import { Notice } from "@/components/ui";
import { btn } from "./styles";
import { submitKeepingValues } from "./submit";
import { colourProblem, normaliseHex, suggestDarker } from "./colour";
import type { AdminAction } from "./types";

type ColourKey = "primary" | "accent";

/** Colour picker + typed colour code, kept in step, with a live accessibility check. */
function ColourField({ id, name, legend, hint, value, onChange }: {
  id: string; name: string; legend: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  const valid = normaliseHex(value);
  const problem = colourProblem(value);
  const better = valid && problem ? suggestDarker(valid) : null;
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-line p-4">
      <legend className="px-1 text-lg font-bold">{legend}</legend>
      <p className="hint -mt-1">{hint}</p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="field">
          <label htmlFor={`${id}-picker`}>Pick a colour</label>
          <input id={`${id}-picker`} type="color" value={valid ?? "#000000"} onChange={(e) => onChange(e.target.value)}
            className="h-12 w-20 cursor-pointer rounded-lg border-2 border-line-strong bg-surface p-1" />
        </div>
        <div className="field">
          <label htmlFor={id}>Or type a colour code</label>
          <input id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} required maxLength={7}
            spellCheck={false} autoComplete="off" className="input tabular w-40 font-mono" aria-describedby={`${id}-status`}
            aria-invalid={problem ? true : undefined} />
        </div>
      </div>
      <div id={`${id}-status`} aria-live="polite">
        {problem ? (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-bad/40 bg-bad-soft p-3">
            <p className="flex items-start gap-2 font-bold text-bad">
              <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0" /> {problem}
            </p>
            {better && (
              <button type="button" onClick={() => onChange(better)} className={btn("secondary", "md", "w-fit")}>
                <span aria-hidden className="size-5 rounded border border-line-strong" style={{ background: better }} />
                Use {better}
              </button>
            )}
          </div>
        ) : (
          <p className="font-bold text-ok">Easy to read – this colour works with {inkFor(valid!) === "#ffffff" ? "white" : "dark"} text.</p>
        )}
      </div>
    </fieldset>
  );
}

export default function BrandingForm({ action, initial, communityName }: {
  action: AdminAction;
  initial: { primary: string; accent: string; logoUrl: string | null };
  communityName: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [colours, setColours] = useState<Record<ColourKey, string>>({ primary: initial.primary, accent: initial.accent });
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // After a successful save, clear the chosen file so it is not uploaded twice.
  useEffect(() => {
    if (state?.ok) {
      if (fileRef.current) fileRef.current.value = "";
      setPreview(null);
      setRemoveLogo(false);
    }
  }, [state]);

  // Free the temporary preview URL when it is replaced.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (k: ColourKey) => (v: string) => setColours((c) => ({ ...c, [k]: v }));
  const primary = normaliseHex(colours.primary);
  const accent = normaliseHex(colours.accent);
  const problems = !!(colourProblem(colours.primary) || colourProblem(colours.accent));
  const brand = primary ?? initial.primary;
  const ink = inkFor(brand);
  const accentBg = accent ?? initial.accent;
  const shownLogo = preview ?? (removeLogo ? null : initial.logoUrl);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-6">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ColourField id="primary_color" name="primary_color" legend="Main colour" value={colours.primary} onChange={set("primary")}
            hint="Used for buttons, links and the top of the public page." />
          <ColourField id="accent_color" name="accent_color" legend="Second colour" value={colours.accent} onChange={set("accent")}
            hint="Used for small highlights." />
        </div>

        {/* Live preview */}
        <section aria-labelledby="preview-title" className="flex flex-col gap-3">
          <h3 id="preview-title" className="text-lg font-bold">Preview</h3>
          <p className="hint -mt-2">This is how your colours will look. Nothing changes until you press Save.</p>
          <div className="overflow-hidden rounded-card border-2 border-line bg-bg">
            <div className="flex items-center gap-3 px-4 py-4" style={{ background: brand, color: ink }}>
              {shownLogo && (
                <Image src={shownLogo} alt="Logo preview" width={48} height={48} unoptimized className="size-12 rounded-xl bg-white object-contain" />
              )}
              <span className="text-xl font-bold">{communityName}</span>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <p className="text-lg font-bold text-ink">Welcome home</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-12 items-center rounded-xl px-5 font-bold" style={{ background: brand, color: ink }}>
                  Report a problem
                </span>
                <span className="inline-flex min-h-10 items-center rounded-full px-4 font-bold"
                  style={{ background: accentBg, color: inkFor(accentBg) }}>
                  New
                </span>
              </div>
              <p className="font-bold underline" style={{ color: inkFor(brand) === "#ffffff" ? brand : "var(--ink)" }}>A link looks like this</p>
            </div>
          </div>
        </section>
      </div>

      {/* Logo */}
      <fieldset className="flex flex-col gap-4 rounded-xl border-2 border-line p-4">
        <legend className="px-1 text-lg font-bold">Logo</legend>
        <div className="flex flex-wrap items-center gap-4">
          {shownLogo ? (
            <Image src={shownLogo} alt={preview ? "The new logo you chose" : `Current logo of ${communityName}`} width={96} height={96}
              unoptimized className="size-24 rounded-xl border border-line bg-white object-contain p-1" />
          ) : (
            <p className="text-muted">{removeLogo ? "The logo will be removed when you save." : "No logo yet."}</p>
          )}
          <div className="field">
            <label htmlFor="logo">Choose a new logo</label>
            <input ref={fileRef} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              className="input" aria-describedby="logo-hint"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
                if (f) setRemoveLogo(false);
              }} />
            <p id="logo-hint" className="hint">
              <ImageUp aria-hidden className="mr-1 inline size-4" />
              PNG, JPG, WebP or GIF, smaller than 2 MB. A square picture works best.
            </p>
          </div>
        </div>
        {initial.logoUrl && !preview && (
          <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3 font-bold">
            <input type="checkbox" name="remove_logo" value="yes" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)}
              className="size-6 shrink-0 accent-[var(--bad)]" />
            Remove the current logo
          </label>
        )}
      </fieldset>

      {problems && <p className="font-bold text-bad">Please fix the colour above before saving.</p>}
      <button type="submit" disabled={pending || problems} className={btn("primary", "lg", "w-full sm:w-fit")}>
        <Save aria-hidden className="size-6" />
        {pending ? "Saving…" : "Save colours and logo"}
      </button>
    </form>
  );
}
