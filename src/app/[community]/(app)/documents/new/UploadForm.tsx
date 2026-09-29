"use client";

import { useActionState, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { Card, Notice } from "@/components/ui";
import { VISIBILITY_HINTS, VISIBILITY_WORDS, fileSize } from "@/components/info/labels";
import { uploadDocument } from "../actions";

const MAX_BYTES = 25 * 1024 * 1024;

export default function UploadForm({ slug, folders, languages, defaultLanguage }: {
  slug: string;
  folders: string[];
  languages: { code: string; name: string }[];
  defaultLanguage: string;
}) {
  const [state, action, pending] = useActionState(uploadDocument.bind(null, slug), undefined);
  const [chosen, setChosen] = useState<{ name: string; size: number; at: number } | null>(null);
  const v = state?.values ?? {};
  const at = state?.at ?? 0;
  // The file input is cleared after each submit (the fields remount), so forget the old choice too.
  const picked = chosen && chosen.at === at ? chosen : null;
  const tooBig = !!picked && picked.size > MAX_BYTES;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div key={at} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">1. About the document</h2>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required minLength={3} maxLength={200} className="input" defaultValue={v.title} placeholder="e.g. Minutes – Annual General Meeting 2026" />
          </div>
          <div className="field">
            <label htmlFor="folder">Folder</label>
            <input id="folder" name="folder" list="folder-list" maxLength={60} className="input" defaultValue={v.folder ?? "General"} aria-describedby="folder-hint" />
            <datalist id="folder-list">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
            <p id="folder-hint" className="hint">Pick an existing folder ({folders.join(", ")}) or type a new name.</p>
          </div>
          <div className="field">
            <label htmlFor="description">Short description <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="description" name="description" maxLength={4000} className="input" defaultValue={v.description} placeholder="What is in this document, in one or two sentences?" />
          </div>
          <div className="field">
            <label htmlFor="language">Language the document is written in</label>
            <select id="language" name="language" className="input" defaultValue={v.language || defaultLanguage}>
              {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
        </Card>

        <Card>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-xl font-bold">2. Who can see it?</legend>
            {(["all", "owners", "admins"] as const).map((key) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="radio" name="visibility" value={key} required defaultChecked={(v.visibility || "all") === key} className="mt-1 size-6 accent-[var(--brand)]" />
                <span>
                  <span className="block text-lg font-bold">{VISIBILITY_WORDS[key]}</span>
                  <span className="text-muted">{VISIBILITY_HINTS[key]}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">3. The file <span className="font-normal text-muted">(optional)</span></h2>
          <input id="file" type="file" name="file" className="peer sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; setChosen(f ? { name: f.name, size: f.size, at } : null); }} />
          <label htmlFor="file" className="peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-5 text-center font-bold hover:border-brand">
            <FileUp aria-hidden className="size-10 text-brand" />
            Choose a file from this device
            <span className="font-normal text-muted">PDF works best. Up to 25 MB.</span>
          </label>
          {picked && (
            <p className={tooBig ? "font-bold text-bad" : "font-bold"} aria-live="polite">
              {tooBig ? "Too large: " : "Chosen: "}{picked.name} ({fileSize(picked.size)})
            </p>
          )}
          <p className="hint">No file? Leave this empty. Residents will see “Paper copy available from the community office”.</p>
        </Card>
      </div>

      {state?.error && !tooBig && <Notice tone="bad">{state.error}</Notice>}
      {tooBig && <Notice tone="bad">This file is larger than 25 MB. Please choose a smaller file.</Notice>}
      <button disabled={pending || tooBig} className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-brand text-xl font-bold text-brand-ink disabled:opacity-60">
        <Upload aria-hidden className="size-6" /> {pending ? "Uploading…" : "Upload document"}
      </button>
    </form>
  );
}
