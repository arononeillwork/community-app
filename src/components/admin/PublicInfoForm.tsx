"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { Notice } from "@/components/ui";
import { btn } from "./styles";
import { submitKeepingValues } from "./submit";
import { languageName } from "./labels";
import RowsEditor from "./RowsEditor";
import type { AdminAction } from "./types";

export type PublicInfoInitial = {
  tagline: Record<string, string>;
  welcome: Record<string, string>;
  address: string;
  lat: string;
  lng: string;
  office_hours: { label: string; hours: string }[];
  emergency_contacts: { label: string; phone: string }[];
  public_notices: { title: string; body: string; date: string }[];
};

export default function PublicInfoForm({ action, languages, initial, today }: {
  action: AdminAction;
  languages: string[];
  initial: PublicInfoInitial;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-8">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      <section aria-labelledby="texts-title" className="flex flex-col gap-4">
        <div>
          <h3 id="texts-title" className="text-xl font-bold">Welcome texts</h3>
          <p className="hint">
            The short line (tagline) appears under the name at the top of the public page. Fill in each language you offer;
            empty languages show the English text instead. To offer more languages, change them under “General”.
          </p>
        </div>
        {languages.map((lang) => (
          <fieldset key={lang} className="flex flex-col gap-3 rounded-xl border-2 border-line p-4">
            <legend className="px-1 text-lg font-bold">{languageName(lang)}</legend>
            <div className="field">
              <label htmlFor={`tagline_${lang}`}>Short line (tagline)</label>
              <input id={`tagline_${lang}`} name={`tagline_${lang}`} lang={lang} maxLength={200} defaultValue={initial.tagline[lang] ?? ""}
                className="input" />
            </div>
            <div className="field">
              <label htmlFor={`welcome_${lang}`}>Welcome text</label>
              <textarea id={`welcome_${lang}`} name={`welcome_${lang}`} lang={lang} maxLength={4000} defaultValue={initial.welcome[lang] ?? ""}
                className="input" />
            </div>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="place-title" className="flex flex-col gap-4">
        <h3 id="place-title" className="text-xl font-bold">Address and map</h3>
        <div className="field max-w-2xl">
          <label htmlFor="address">Address</label>
          <input id="address" name="address" maxLength={300} defaultValue={initial.address} className="input" autoComplete="off" />
        </div>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="lat">Latitude (optional)</label>
            <input id="lat" name="lat" inputMode="decimal" defaultValue={initial.lat} placeholder="e.g. 36.4843" className="input tabular"
              aria-describedby="coords-hint" />
          </div>
          <div className="field">
            <label htmlFor="lng">Longitude (optional)</label>
            <input id="lng" name="lng" inputMode="decimal" defaultValue={initial.lng} placeholder="e.g. -4.9906" className="input tabular"
              aria-describedby="coords-hint" />
          </div>
        </div>
        <p id="coords-hint" className="hint max-w-2xl">
          These two numbers put your building on the map. In Google Maps or OpenStreetMap, right-click the building to copy them.
          Leave both empty to hide the “Show on map” link.
        </p>
      </section>

      <RowsEditor
        name="office_hours"
        legend="Opening hours"
        intro="For example the office, the concierge or the pool."
        itemLabel="Opening hours"
        fields={[
          { key: "label", label: "What", placeholder: "e.g. Office (Mon–Fri)", maxLength: 80 },
          { key: "hours", label: "Times", placeholder: "e.g. 09:00 – 14:00", maxLength: 120 },
        ]}
        initial={initial.office_hours}
        addLabel="Add opening hours"
        empty="No opening hours yet."
      />

      <RowsEditor
        name="emergency_contacts"
        legend="Important phone numbers"
        intro="Shown in a big box on the public page. Put the most urgent number first."
        itemLabel="Phone number"
        fields={[
          { key: "label", label: "Who", placeholder: "e.g. Concierge desk", maxLength: 100 },
          { key: "phone", label: "Phone number", type: "tel", placeholder: "e.g. +34 600 100 200", maxLength: 40 },
        ]}
        initial={initial.emergency_contacts}
        addLabel="Add a phone number"
        empty="No phone numbers yet. We recommend adding at least the emergency number 112."
      />

      <RowsEditor
        name="public_notices"
        legend="Public notices"
        intro="Short news anyone can read, for example “Pool closed on Monday”."
        itemLabel="Notice"
        fields={[
          { key: "title", label: "Title", maxLength: 120 },
          { key: "date", label: "Date", type: "date" },
          { key: "body", label: "Text", type: "textarea", maxLength: 2000 },
        ]}
        initial={initial.public_notices}
        newRow={{ date: today }}
        addLabel="Add a notice"
        empty="No notices at the moment."
      />

      <button type="submit" disabled={pending} className={btn("primary", "lg", "w-full sm:w-fit")}>
        <Save aria-hidden className="size-6" />
        {pending ? "Saving…" : "Save public page"}
      </button>
    </form>
  );
}
