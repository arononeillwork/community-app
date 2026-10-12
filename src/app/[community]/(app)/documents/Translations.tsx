"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Languages } from "lucide-react";
import { Badge, Card, Notice, SectionHeader, buttonClass } from "@/components/ui";
import { Field, fieldProps } from "@/components/library/Field";
import { deleteTranslation, saveTranslation, type TranslationState } from "./actions";

export type TranslationRow = { language: string; name: string; status: string; text: string };

/** Remove a translation with an inline "are you sure" step. */
function RemoveTranslation({ slug, documentId, row }: { slug: string; documentId: string; row: TranslationRow }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) yesRef.current?.focus(); }, [asking]);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={buttonClass("ghost", "sm")}>
        <span className="text-bad">Remove<span className="sr-only"> the {row.name} translation</span></span>
      </button>
    );
  }
  return (
    <div role="group" aria-label={`Remove the ${row.name} translation?`} className="flex flex-wrap items-center gap-2">
      {error && <span className="text-sm text-bad">{error}</span>}
      <button ref={yesRef} type="button" disabled={pending} className={buttonClass("danger", "sm")}
        onClick={() => startTransition(async () => {
          const res = await deleteTranslation(slug, documentId, row.language);
          if (res?.error) setError(res.error);
        })}>
        {pending ? "Removing…" : `Remove ${row.name}`}
      </button>
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className={buttonClass("secondary", "sm")}>Keep</button>
    </div>
  );
}

export default function Translations({ slug, documentId, originalName, rows, missing, notice }: {
  slug: string;
  documentId: string;
  originalName: string;
  rows: TranslationRow[];
  /** Community languages that have no translation yet. */
  missing: { code: string; name: string }[];
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState<TranslationState, FormData>(saveTranslation.bind(null, slug, documentId), undefined);
  const [, startTransition] = useTransition();
  const options = [...missing, ...rows.map((r) => ({ code: r.language, name: r.name }))];
  const [language, setLanguage] = useState(missing[0]?.code ?? rows[0]?.language ?? "");
  const [body, setBody] = useState(() => (missing.length ? "" : rows[0]?.text ?? ""));
  const err = (k: "language" | "translated_text") => state?.fields?.[k];
  const existing = rows.find((r) => r.language === language);

  function choose(code: string) {
    setLanguage(code);
    setBody(rows.find((r) => r.language === code)?.text ?? "");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <Card padded={false} className="scroll-mt-24">
      <div id="translations" className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={Languages} title="Translations" description={`Residents can read the text in their own language. The ${originalName} original stays the legal version.`} />
      </div>
      {notice && <div className="px-5 pb-3 sm:px-6"><Notice tone="ok">{notice}</Notice></div>}
      {rows.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.language} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
              <span className="min-w-0 flex-1 font-medium text-ink">{r.name}</span>
              {r.status === "done" ? <Badge tone="ok">Shown to residents</Badge>
                : r.status === "pending" ? <Badge tone="warn">Being prepared</Badge> : <Badge tone="bad">Failed</Badge>}
              <RemoveTranslation slug={slug} documentId={documentId} row={r} />
            </li>
          ))}
        </ul>
      )}

      {options.length === 0 ? (
        <p className="px-5 py-5 text-[0.9375rem] text-muted sm:px-6">This community has no other languages switched on.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="text-[0.9375rem] font-semibold">{rows.length ? "Add or update a translation" : "Add a translation"}</h3>
          {state?.error && <Notice tone="bad">{state.error}</Notice>}
          <Field id="language" label={existing ? "Language · replaces the current translation" : "Language"} error={err("language")} className="sm:max-w-xs">
            <select {...fieldProps("language", err("language"))} className="input" value={language} onChange={(e) => choose(e.target.value)}>
              {missing.length > 0 && <optgroup label="Not translated yet">{missing.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</optgroup>}
              {rows.length > 0 && <optgroup label="Already translated">{rows.map((r) => <option key={r.language} value={r.language}>{r.name}</option>)}</optgroup>}
            </select>
          </Field>
          <Field id="translated_text" label="Translated text" error={err("translated_text")} hint="Keep the same headings and lists as the original.">
            <textarea {...fieldProps("translated_text", err("translated_text"), true)} className="input min-h-48" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div>
            <button disabled={pending} type="submit" className={buttonClass("secondary")}>
              {pending ? "Saving…" : existing ? "Save translation" : "Add translation"}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
