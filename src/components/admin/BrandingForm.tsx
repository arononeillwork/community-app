"use client";

import { useFormAction } from "./useFormAction";
import { useState } from "react";
import { Home, Palette, Users } from "lucide-react";
import { Badge, Notice, SectionHeader } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import { HEX, brandPreview, suggestAccessible } from "./brand";

type State = { error?: string } | undefined;

function ColourField({ id, label, hint, value, onChange }: {
  id: string; label: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  const p = valid ? brandPreview(value) : null;
  const suggestion = valid && !p!.ok ? suggestAccessible(value) : null;
  // Round down, so 4.48:1 never reads as "4.5:1" next to "needs 4.5:1".
  const ratio = p ? (Math.floor(p.ratio * 10) / 10).toFixed(1) : "";
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`Pick the ${label.toLowerCase()}`}
          className="h-[2.875rem] w-14 shrink-0 cursor-pointer rounded-[10px] border border-line-strong bg-surface p-1" />
        <input id={id} name={id} className="input tabular" value={value} onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7} pattern="#[0-9a-fA-F]{6}" required spellCheck={false} aria-describedby={`${id}-check`} />
      </div>
      <div id={`${id}-check`} className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {!valid ? <span className="text-bad">Use a code like #0f766e.</span> : p!.ok ? (
          <><Badge tone="ok">Readable</Badge><span>Text contrast {ratio}:1</span></>
        ) : (
          <>
            <Badge tone="bad">Too hard to read</Badge>
            <span>{ratio}:1, needs 4.5:1.</span>
            <button type="button" onClick={() => onChange(suggestion!)} className="inline-flex items-center gap-1.5 font-medium text-brand-text underline-offset-4 hover:underline">
              <span aria-hidden className="size-3.5 rounded-full ring-1 ring-black/10" style={{ background: suggestion! }} />
              Use {suggestion}
            </button>
          </>
        )}
      </div>
      <p className="hint">{hint}</p>
    </div>
  );
}

/** Colours (checked for contrast), logo and hero photo, with a live preview. */
export default function BrandingForm({ action, initial, communityName }: {
  action: (prev: State, form: FormData) => Promise<State>;
  initial: { primary: string; accent: string; logo: string; hero: string };
  communityName: string;
}) {
  const { state, formProps } = useFormAction(action);
  const [primary, setPrimary] = useState(initial.primary);
  const [accent, setAccent] = useState(initial.accent);
  const [logo, setLogo] = useState(initial.logo);

  const pc = HEX.test(primary) ? primary : initial.primary;
  const ac = HEX.test(accent) ? accent : initial.accent;
  const p = brandPreview(pc);
  const a = brandPreview(ac);
  const logoOk = /^(https:\/\/|\/(?!\/))\S+$/.test(logo);

  return (
    <form {...formProps} className="flex flex-col gap-6">
      <SectionHeader icon={Palette} title="Branding" description="Colours and logo used on every page" className="!mb-0" />
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <ColourField id="primary_color" label="Main colour" hint="Buttons, links and the selected menu item." value={primary} onChange={setPrimary} />
          <ColourField id="accent_color" label="Accent colour" hint="Small highlights." value={accent} onChange={setAccent} />
        </div>

        {/* Live preview, drawn with the colours being edited */}
        <div aria-label="Preview" role="img" className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-4">
          <div className="text-sm font-medium text-muted" aria-hidden>Preview</div>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3" aria-hidden>
            {logoOk
              // eslint-disable-next-line @next/next/no-img-element -- any logo address the admin enters, shown as-is
              ? <img src={logo} alt="" className="size-9 shrink-0 rounded-[10px] object-contain" />
              : <span className="grid size-9 shrink-0 place-items-center rounded-[10px] font-semibold" style={{ background: pc, color: p.ink }}>{communityName[0]}</span>}
            <span className="truncate font-semibold">{communityName}</span>
          </div>
          <ul className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-2" aria-hidden>
            <li className="flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium" style={{ background: p.soft, color: p.text }}>
              <Home className="size-[1.15rem]" /> Home
            </li>
            <li className="flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium text-ink-2">
              <Users className="size-[1.15rem] text-muted" /> Members
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2" aria-hidden>
            <span className="inline-flex min-h-11 items-center rounded-[10px] px-4 text-[0.9375rem] font-medium shadow-card" style={{ background: pc, color: p.ink }}>
              Report a problem
            </span>
            <span className="inline-flex min-h-8 items-center rounded-full px-3 text-sm font-medium" style={{ background: ac, color: a.ink }}>
              New
            </span>
            <span className="text-[0.9375rem] font-medium underline underline-offset-4" style={{ color: p.text }}>A link</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="logo_url">Logo address</label>
          <input id="logo_url" name="logo_url" className="input" value={logo} onChange={(e) => setLogo(e.target.value)} maxLength={500}
            placeholder="https://… or /communities/…/logo.svg" spellCheck={false} />
          <p className="hint">A square image works best. Leave empty to show the first letter.</p>
        </div>
        <div className="field">
          <label htmlFor="hero_image_url">Landing page photo <span className="font-normal text-muted">· optional</span></label>
          <input id="hero_image_url" name="hero_image_url" className="input" defaultValue={initial.hero} maxLength={500}
            placeholder="https://…" spellCheck={false} />
          <p className="hint">A wide photo of the building or the garden.</p>
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-6">
        <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save branding</SubmitButton>
      </div>
    </form>
  );
}
