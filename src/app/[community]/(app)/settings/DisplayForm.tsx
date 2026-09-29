"use client";

import { useActionState, useState } from "react";
import { Bell, Eye, Languages, Type, Volume2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { RadioCard, SaveButton, ToggleCard } from "@/components/people/choices";
import { submitKeepingValues } from "@/components/people/submit";
import { saveDisplay } from "./actions";

export type DisplayValues = {
  font_scale: number;
  high_contrast: boolean;
  reduce_motion: boolean;
  dyslexia_font: boolean;
  simple_mode: boolean;
  language: string;
  notify_channel: string;
  speech_rate: number;
  voice_enabled: boolean;
};

const SIZES = [
  { value: 100, title: "Normal" },
  { value: 125, title: "Large" },
  { value: 150, title: "Larger" },
  { value: 175, title: "Very large" },
  { value: 200, title: "Largest" },
];

const SPEEDS = [
  { value: 0.8, title: "Slower", description: "Calm and easy to follow." },
  { value: 1.0, title: "Normal", description: "A usual speaking speed." },
  { value: 1.2, title: "Faster", description: "For when you want to get through things quickly." },
];

const SAMPLE = "The bins go out on Tuesday.";

export default function DisplayForm({ slug, initial, languages, whatsappEnabled, hasPhone }: {
  slug: string;
  initial: DisplayValues;
  languages: { code: string; label: string }[];
  whatsappEnabled: boolean;
  hasPhone: boolean;
}) {
  const [state, action, pending] = useActionState(saveDisplay.bind(null, slug), undefined);
  const [v, setV] = useState<DisplayValues>(initial);
  const set = <K extends keyof DisplayValues>(key: K, value: DisplayValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="flex flex-col gap-6">
      {/* 1. Text size */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Type aria-hidden className="size-6" /> Text size
        </legend>
        <p className="text-muted">Choose the size that is most comfortable. Each choice shows how big the text will be.</p>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <RadioCard
              key={sz.value}
              name="font_scale"
              value={String(sz.value)}
              checked={v.font_scale === sz.value}
              onChange={() => set("font_scale", sz.value)}
              title={<>{sz.title} <span className="font-normal text-muted">({sz.value}%)</span></>}
            >
              {/* Pixel size so the sample shows the real size, whatever the current setting is. */}
              <span className="block break-words leading-snug" style={{ fontSize: `${(18 * sz.value) / 100}px` }} aria-hidden>
                {SAMPLE}
              </span>
            </RadioCard>
          ))}
        </div>
      </fieldset>

      {/* 2. Easier reading */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Eye aria-hidden className="size-6" /> Easier to see and read
        </legend>
        <ToggleCard
          name="high_contrast"
          checked={v.high_contrast}
          onChange={(c) => set("high_contrast", c)}
          title="High contrast"
          description="Black text on white, with strong outlines. Easier to see."
        />
        <ToggleCard
          name="dyslexia_font"
          checked={v.dyslexia_font}
          onChange={(c) => set("dyslexia_font", c)}
          title="Reading-friendly font"
          description={
            <>
              A rounder font with more space between letters. Many people with dyslexia find it easier.{" "}
              <span className="mt-1 block text-ink" style={{ fontFamily: "var(--font-dys), system-ui, sans-serif", letterSpacing: "0.03em" }}>
                Example: {SAMPLE}
              </span>
            </>
          }
        />
        <ToggleCard
          name="reduce_motion"
          checked={v.reduce_motion}
          onChange={(c) => set("reduce_motion", c)}
          title="Reduce movement"
          description="Stops animations and sliding effects on the screen."
        />
        <ToggleCard
          name="simple_mode"
          checked={v.simple_mode}
          onChange={(c) => set("simple_mode", c)}
          title="Simple mode"
          description="Shows only the most important things, so screens are less busy."
        />
      </fieldset>

      {/* 3. Language */}
      <div className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-xl font-bold">
          <Languages aria-hidden className="size-6" /> Language
        </h3>
        {languages.length > 1 ? (
          <div className="field">
            <label htmlFor="language">Language for the app</label>
            <select id="language" name="language" className="input" value={v.language} onChange={(e) => set("language", e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="hint">Menus and messages use this language wherever a translation is available.</p>
          </div>
        ) : (
          <>
            <p>This community uses <strong>{languages[0]?.label ?? "English"}</strong>.</p>
            <input type="hidden" name="language" value={v.language} />
          </>
        )}
      </div>

      {/* 4. Notifications */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Bell aria-hidden className="size-6" /> How should we send you messages?
        </legend>
        <p className="text-muted">For news, meeting invitations and replies to your reports.</p>
        <RadioCard
          name="notify_channel"
          value="email"
          checked={v.notify_channel === "email"}
          onChange={() => set("notify_channel", "email")}
          title="Email"
          description="Messages go to your email inbox."
        />
        <RadioCard
          name="notify_channel"
          value="whatsapp"
          checked={v.notify_channel === "whatsapp"}
          onChange={() => set("notify_channel", "whatsapp")}
          title="WhatsApp"
          description={
            <>
              Messages arrive in WhatsApp on your phone.
              {!hasPhone && <span className="mt-1 block font-bold text-warn">Please add your phone number under “My details” below.</span>}
              {!whatsappEnabled && (
                <span className="mt-1 block">WhatsApp messages are not switched on in this community yet. Until then, we will email you.</span>
              )}
            </>
          }
        />
        <RadioCard
          name="notify_channel"
          value="push"
          checked={v.notify_channel === "push"}
          onChange={() => set("notify_channel", "push")}
          title="In the app"
          description="A notification from this app on your phone or computer. You can also see them under “Alerts” at the top."
        />
      </fieldset>

      {/* 5. Voice helper */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Volume2 aria-hidden className="size-6" /> Voice helper <span className="font-normal text-muted">(coming soon)</span>
        </legend>
        <p className="text-muted">A voice that reads pages out loud is on its way. You can choose your settings now.</p>
        <ToggleCard
          name="voice_enabled"
          checked={v.voice_enabled}
          onChange={(c) => set("voice_enabled", c)}
          title="Use the voice helper"
          description="Let the app read things out loud to you."
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-bold">Speaking speed</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {SPEEDS.map((sp) => (
              <RadioCard
                key={sp.value}
                name="speech_rate"
                value={String(sp.value)}
                checked={v.speech_rate === sp.value}
                onChange={() => set("speech_rate", sp.value)}
                title={sp.title}
                description={sp.description}
              />
            ))}
          </div>
        </fieldset>
      </fieldset>

      <div className="flex flex-col gap-3">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        {state?.ok && !dirty && !pending && <Notice tone="ok">{state.ok}</Notice>}
        {dirty && !pending && <p className="font-bold text-warn">You have changes that are not saved yet.</p>}
        <SaveButton pending={pending}>Save display settings</SaveButton>
      </div>
    </form>
  );
}
