"use client";

import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import { Notice } from "@/components/ui";
import { btn } from "./styles";
import { submitKeepingValues } from "./submit";
import { LANGUAGES } from "./labels";
import type { AdminAction } from "./types";

export type GeneralInitial = {
  name: string;
  tenantRequiresApproval: boolean;
  threshold: string; // euros, e.g. "1000.00"
  languages: string[];
  defaultLanguage: string;
};

export default function GeneralSettingsForm({ action, initial }: { action: AdminAction; initial: GeneralInitial }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [defaultLanguage, setDefaultLanguage] = useState(initial.defaultLanguage);

  function toggle(code: string, on: boolean) {
    const next = on ? [...languages, code] : languages.filter((l) => l !== code);
    setLanguages(next);
    if (!next.includes(defaultLanguage) && next.length > 0) setDefaultLanguage(LANGUAGES.find((l) => next.includes(l.code))?.code ?? next[0]);
  }

  const enabled = LANGUAGES.filter((l) => languages.includes(l.code));

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-6">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}

      <div className="field max-w-xl">
        <label htmlFor="community-name">Community name</label>
        <input id="community-name" name="name" required minLength={2} maxLength={100} defaultValue={initial.name} className="input" />
      </div>

      <label className="flex max-w-3xl cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-4">
        <input type="checkbox" name="tenant_requires_approval" value="yes" defaultChecked={initial.tenantRequiresApproval}
          className="mt-1 size-6 shrink-0 accent-[var(--brand)]" />
        <span>
          <span className="block text-lg font-bold">Tenants added by landlords need approval</span>
          <span className="block text-muted">
            When this is ticked, a tenant that an owner adds can only use the app after an administrator approves them
            on the People &amp; flats page.
          </span>
        </span>
      </label>

      <div className="field max-w-md">
        <label htmlFor="threshold">Invoice approval limit (euros)</label>
        <input id="threshold" name="threshold" inputMode="decimal" required defaultValue={initial.threshold} className="input tabular"
          aria-describedby="threshold-hint" />
        <p id="threshold-hint" className="hint">
          Invoices above this amount must be approved by a second person (for example the administrator and the treasurer)
          before they are paid. Example: 1000 or 1000.00.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-bold">Languages residents can choose</legend>
        <p className="hint -mt-1">The public page shows a text box for the welcome text in every language you switch on.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LANGUAGES.map((l) => (
            <label key={l.code} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line px-4 py-2">
              <input type="checkbox" name="languages" value={l.code} checked={languages.includes(l.code)}
                onChange={(e) => toggle(l.code, e.target.checked)} className="size-6 shrink-0 accent-[var(--brand)]" />
              <span className="font-bold">{l.name}</span>
            </label>
          ))}
        </div>
        {languages.length === 0 && <p className="font-bold text-bad">Please switch on at least one language.</p>}
      </fieldset>

      <div className="field max-w-md">
        <label htmlFor="default-language">Main language</label>
        <select id="default-language" name="default_language" className="input" value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value)} aria-describedby="default-language-hint">
          {enabled.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <p id="default-language-hint" className="hint">Used when a visitor has not chosen a language yet.</p>
      </div>

      <button type="submit" disabled={pending || languages.length === 0} className={btn("primary", "lg", "w-full sm:w-fit")}>
        <Save aria-hidden className="size-6" />
        {pending ? "Saving…" : "Save general settings"}
      </button>
    </form>
  );
}
