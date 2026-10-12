"use client";

import { useFormAction } from "./useFormAction";
import { useState } from "react";
import clsx from "clsx";
import { ExternalLink, Globe } from "lucide-react";
import { Notice, SectionHeader } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import Repeater from "./Repeater";
import { languageName } from "./format";

type State = { error?: string } | undefined;

export type PublicInfo = {
  tagline: Record<string, string>;
  welcome: Record<string, string>;
  address: string | null;
  lat: number | null;
  lng: number | null;
  office_hours: { label: string; hours: string }[];
  emergency_contacts: { label: string; phone: string }[];
  public_notices: { title: string; body: string; date: string }[];
};

/** Everything on the public landing page, edited in one form. */
export default function PublicInfoForm({ action, info, languages, defaultLanguage, landingHref, today }: {
  action: (prev: State, form: FormData) => Promise<State>;
  info: PublicInfo;
  languages: string[];
  defaultLanguage: string;
  landingHref: string;
  today: string;
}) {
  const { state, formProps } = useFormAction(action);
  const ordered = [defaultLanguage, ...languages.filter((l) => l !== defaultLanguage)];
  const [lang, setLang] = useState(ordered[0]);

  return (
    <form {...formProps} className="flex flex-col gap-6">
      <SectionHeader icon={Globe} title="Landing page" description="What visitors see before they sign in" className="!mb-0"
        action={<a href={landingHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium no-underline hover:underline">
          View <ExternalLink aria-hidden className="size-3.5" /><span className="sr-only">the landing page (opens in a new tab)</span></a>} />
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <fieldset className="min-w-0 flex flex-col gap-4">
        <legend className="mb-1 text-[1rem] font-semibold">Welcome</legend>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Language">
          {ordered.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={lang === l} aria-controls={`lang-${l}`} onClick={() => setLang(l)}
              className={clsx("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-medium transition-colors",
                lang === l ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 ring-1 ring-inset ring-line hover:text-ink")}>
              {languageName(l)}
              {!info.tagline[l] && !info.welcome[l] && <span className={clsx("text-xs", lang === l ? "opacity-80" : "text-muted")}>· empty</span>}
            </button>
          ))}
        </div>
        {ordered.map((l) => (
          <div key={l} id={`lang-${l}`} role="tabpanel" hidden={lang !== l} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor={`tagline_${l}`}>Tagline <span className="font-normal text-muted">· {languageName(l)}</span></label>
              <input id={`tagline_${l}`} name={`tagline_${l}`} className="input" maxLength={120} defaultValue={info.tagline[l] ?? ""}
                placeholder="One short line under the community name" lang={l} />
            </div>
            <div className="field">
              <label htmlFor={`welcome_${l}`}>Welcome text <span className="font-normal text-muted">· {languageName(l)}</span></label>
              <textarea id={`welcome_${l}`} name={`welcome_${l}`} className="input" maxLength={1500} defaultValue={info.welcome[l] ?? ""}
                placeholder="Two or three friendly sentences about the community and this site." lang={l} />
            </div>
          </div>
        ))}
        <p className="hint">Languages without text show the {languageName(defaultLanguage)} version.</p>
      </fieldset>

      <fieldset className="min-w-0 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
        <legend className="sr-only">Address and map</legend>
        <div className="field sm:col-span-2">
          <label htmlFor="address">Address</label>
          <input id="address" name="address" className="input" maxLength={200} defaultValue={info.address ?? ""} placeholder="Street, number, postcode, town" />
        </div>
        <div className="field">
          <label htmlFor="lat">Latitude <span className="font-normal text-muted">· for the map</span></label>
          <input id="lat" name="lat" inputMode="decimal" className="input tabular" defaultValue={info.lat ?? ""} placeholder="36.4843" />
        </div>
        <div className="field">
          <label htmlFor="lng">Longitude</label>
          <input id="lng" name="lng" inputMode="decimal" className="input tabular" defaultValue={info.lng ?? ""} placeholder="-4.9906" />
        </div>
        <p className="hint sm:col-span-2">Tip: right-click the building in Google Maps to copy both numbers.</p>
      </fieldset>

      <div className="border-t border-line pt-6">
        <Repeater id="oh" compact legend="Opening hours" addLabel="Add opening hours" empty="No opening hours yet."
          fields={[
            { name: "oh_label", label: "What", placeholder: "e.g. Office (Mon–Fri)", maxLength: 60 },
            { name: "oh_hours", label: "Hours", placeholder: "e.g. 09:00 – 14:00", maxLength: 80 },
          ]}
          initial={info.office_hours.map((h) => ({ oh_label: h.label, oh_hours: h.hours }))} />
      </div>

      <div className="border-t border-line pt-6">
        <Repeater id="ec" compact legend="Important numbers" hint="Always shown on the landing page, even to people who are not signed in."
          addLabel="Add a number" empty="No numbers yet. Add 112 and the concierge at least."
          fields={[
            { name: "ec_label", label: "Who", placeholder: "e.g. Concierge desk", maxLength: 80 },
            { name: "ec_phone", label: "Phone", type: "tel", placeholder: "+34 600 100 200", maxLength: 24 },
          ]}
          initial={info.emergency_contacts.map((e) => ({ ec_label: e.label, ec_phone: e.phone }))} />
      </div>

      <div className="border-t border-line pt-6">
        <Repeater id="pn" legend="Public notices" hint="Short news for everyone, such as the pool closing. Newest first."
          addLabel="Add a notice" empty="No notices at the moment."
          fields={[
            { name: "pn_title", label: "Title", placeholder: "e.g. Pool closed for cleaning", maxLength: 100 },
            { name: "pn_date", label: "Date", type: "date" },
            { name: "pn_body", label: "Message", type: "textarea", placeholder: "One or two sentences.", maxLength: 600 },
          ]}
          initial={info.public_notices.map((n) => ({ pn_title: n.title, pn_date: n.date, pn_body: n.body }))}
          defaults={{ pn_date: today }} />
      </div>

      <div className="flex justify-end border-t border-line pt-6">
        <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save landing page</SubmitButton>
      </div>
    </form>
  );
}
