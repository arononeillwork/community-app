"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileUp, X } from "lucide-react";
import { Card, Notice, buttonClass } from "@/components/ui";
import { ChoiceCard, Choices, Field, fieldProps } from "@/components/library/Field";
import {
  FILE_ACCEPT, FILE_TYPES, MAX_FILE_BYTES, VISIBILITIES, VISIBILITY_HINTS, VISIBILITY_LABELS, fileExtension, formatBytes,
} from "@/components/library/meta";
import { updateDocument, uploadDocument, type DocField, type DocFormState } from "./actions";

export type DocValues = Record<Exclude<DocField, "file">, string>;

const NEW_FOLDER = "__new";

/** "agm-minutes_2026.pdf" → "Agm minutes 2026" */
function titleFromFile(name: string) {
  const t = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export default function DocumentForm({ slug, id, initial, folders, languages, currentFile }: {
  slug: string;
  id: string | null;
  initial: DocValues;
  folders: string[];
  languages: { code: string; name: string }[];
  currentFile: { kind: string; size: string | null } | null;
}) {
  const action = id ? updateDocument.bind(null, slug, id) : uploadDocument.bind(null, slug);
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(action, undefined);
  const [, startTransition] = useTransition();
  const [v, setV] = useState<DocValues>(initial);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof DocValues) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const err = (k: DocField) => (k === "file" && fileError) || state?.fields?.[k];

  function onFile(files: FileList | null) {
    const f = files?.[0];
    setFileError(null);
    if (!f) { setPicked(null); return; }
    if (!FILE_TYPES[fileExtension(f.name)]) setFileError("Use a PDF, a photo (JPG, PNG, WebP, HEIC), or a Word or Excel file.");
    else if (f.size > MAX_FILE_BYTES) setFileError("The file is larger than 20 MB. Please make it smaller first.");
    if (!FILE_TYPES[fileExtension(f.name)] || f.size > MAX_FILE_BYTES) {
      if (fileRef.current) fileRef.current.value = "";
      setPicked(null);
      return;
    }
    setPicked({ name: f.name, size: f.size });
    if (!v.title.trim()) setV((cur) => ({ ...cur, title: titleFromFile(f.name) }));
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setPicked(null);
    setFileError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-[1.0625rem] font-semibold">{id ? "File" : "Choose the file"}</h2>
        {id && (
          <p className="text-[0.9375rem] text-muted">
            {currentFile ? <>Current file: {currentFile.kind}{currentFile.size ? ` · ${currentFile.size}` : ""}. Choose a new one only to replace it.</> : "This document has no file yet. You can add one."}
          </p>
        )}
        <label htmlFor="file"
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong/70 p-5 text-center font-medium text-ink-2 transition-colors hover:border-brand hover:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]">
          <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand-text"><FileUp aria-hidden className="size-5" /></span>
          {picked ? <span className="break-all text-ink">{picked.name}</span> : id && currentFile ? "Choose a new file" : "Choose a file"}
          <span className="text-sm font-normal text-muted">{picked ? formatBytes(picked.size) : "PDF, photo, Word or Excel · up to 20 MB"}</span>
          <input ref={fileRef} id="file" type="file" name="file" accept={FILE_ACCEPT} className="sr-only"
            aria-invalid={err("file") ? true : undefined} aria-describedby={err("file") ? "file-error" : undefined}
            onChange={(e) => onFile(e.target.files)} />
        </label>
        {err("file") && <p id="file-error" className="text-sm text-bad">{err("file")}</p>}
        {picked && (
          <button type="button" onClick={clearFile} className="inline-flex w-fit items-center gap-1 text-[0.9375rem] font-medium text-bad hover:underline">
            <X aria-hidden className="size-4" /> Remove file
          </button>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Details</h2>
        <Field id="title" label="Title" error={err("title")}>
          <input {...fieldProps("title", err("title"))} className="input" maxLength={120} value={v.title} onChange={set("title")} placeholder="e.g. House rules 2026" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="folder" label="Folder" error={err("folder")}>
            <select {...fieldProps("folder", err("folder"))} className="input" value={v.folder} onChange={set("folder")}>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value={NEW_FOLDER}>New folder…</option>
            </select>
          </Field>
          <Field id="original_language" label="Written in" error={err("original_language")}>
            <select {...fieldProps("original_language", err("original_language"))} className="input" value={v.original_language} onChange={set("original_language")}>
              {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        {v.folder === NEW_FOLDER && (
          <Field id="new_folder" label="New folder name" error={err("new_folder")}>
            <input {...fieldProps("new_folder", err("new_folder"))} className="input" maxLength={40} value={v.new_folder} onChange={set("new_folder")} placeholder="e.g. Insurance" autoFocus />
          </Field>
        )}
        <Field id="description" label="Short description" optional error={err("description")} hint="One line residents see in the list.">
          <input {...fieldProps("description", err("description"), true)} className="input" maxLength={200} value={v.description} onChange={set("description")} placeholder="e.g. Everyday rules for all residents." />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <Choices id="visibility" legend="Who can see it" error={err("visibility")}>
          <div className="grid gap-2 sm:grid-cols-3">
            {VISIBILITIES.map((x) => (
              <ChoiceCard key={x} checked={v.visibility === x}>
                <input type="radio" name="visibility" value={x} checked={v.visibility === x} onChange={set("visibility")} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                <span><span className="block font-medium text-ink">{VISIBILITY_LABELS[x]}</span><span className="block text-sm leading-snug text-muted">{VISIBILITY_HINTS[x]}</span></span>
              </ChoiceCard>
            ))}
          </div>
        </Choices>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field id="extracted_text" label="Text for reading on screen" optional error={err("extracted_text")}
          hint="Paste the text so residents can read it on their phone, find it by searching and have it translated.">
          <textarea {...fieldProps("extracted_text", err("extracted_text"), true)} className="input min-h-48" value={v.extracted_text} onChange={set("extracted_text")}
            placeholder={"Quiet hours\n• 23:00 – 08:00 every day.\n• 15:00 – 17:00 in July and August."} />
        </Field>
      </Card>

      <button disabled={pending} type="submit" className={buttonClass("primary", "lg", "w-full sm:w-auto sm:self-end sm:px-8")}>
        {pending ? (picked ? "Uploading…" : "Saving…") : id ? "Save changes" : "Upload document"}
      </button>
    </form>
  );
}
