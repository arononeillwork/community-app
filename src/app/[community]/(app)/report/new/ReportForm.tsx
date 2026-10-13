"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, X } from "lucide-react";
import { createReport } from "../actions";
import { Card, Notice, buttonClass } from "@/components/ui";

type Opt = { id: string; label?: string; name?: string };

const MAX_PHOTOS = 5;
const MAX_SIDE = 2000;

/**
 * Shrink a phone photo to at most 2000 px on the longest side (JPEG, quality 0.8), so a 12 MB camera
 * picture uploads as well under 1 MB on a slow connection. Anything the browser can't draw (some HEIC
 * files) or that is already small is sent as it is; the server still checks type and size.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export default function ReportForm({ slug, categories, units }: { slug: string; categories: Opt[]; units: Opt[] }) {
  const [state, action, pending] = useActionState(createReport.bind(null, slug), undefined);
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<"incident" | "complaint">("incident");
  const [target, setTarget] = useState("common_area");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [tooMany, setTooMany] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    const picked = Array.from(files ?? []);
    setTooMany(picked.length > MAX_PHOTOS);
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreparing(true);
    const ready = await Promise.all(picked.slice(0, MAX_PHOTOS).map(shrink));
    setPhotos(ready);
    setPreviews(ready.map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
    setPreparing(false);
  }

  function clearPhotos() {
    if (fileRef.current) fileRef.current.value = "";
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setPreviews([]);
    setTooMany(false);
  }

  // Send the prepared (smaller) photos, and keep what was typed if the server asks for a fix.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preparing) return;
    const data = new FormData(e.currentTarget);
    data.delete("photos");
    for (const f of photos) data.append("photos", f);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 text-[1.0625rem] font-semibold sm:col-span-2">What kind of problem?</legend>
          {[
            { v: "incident", t: "Something is broken or dangerous", d: "e.g. a leak, broken light, lift stuck, damaged gate" },
            { v: "complaint", t: "A complaint", d: "e.g. noise, parking, pets, cleaning not done" },
          ].map((o) => (
            <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${kind === o.v ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="kind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v as typeof kind)} className="mt-1 size-5 accent-[var(--brand)]" />
              <span><span className="block font-medium text-ink">{o.t}</span><span className="text-[0.9375rem] text-muted">{o.d}</span></span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Tell us about it</h2>
        <div className="field">
          <label htmlFor="title">Short title</label>
          <input id="title" name="title" required maxLength={120} className="input" placeholder={kind === "incident" ? "e.g. Water leaking in Block B stairs" : "e.g. Loud music late at night"} />
        </div>
        <div className="field">
          <label htmlFor="description">What happened?</label>
          <textarea id="description" name="description" required className="input" placeholder="When did it happen? Where exactly?" />
        </div>
        <div className="field">
          <label htmlFor="category_id">Category</label>
          <select id="category_id" name="category_id" className="input" defaultValue="">
            <option value="">Not sure</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="target_type">Where / who is it about?</label>
          <select id="target_type" name="target_type" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="common_area">A shared area (garden, pool, stairs, garage…)</option>
            <option value="unit">A particular flat</option>
          </select>
        </div>
        {target === "unit" ? (
          <div className="field">
            <label htmlFor="target_unit_id">Which flat?</label>
            <select id="target_unit_id" name="target_unit_id" className="input" required>
              <option value="">Choose a flat</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="location">Where exactly?</label>
            <input id="location" name="location" className="input" placeholder="e.g. Pool steps, Block A entrance" />
          </div>
        )}
        {kind === "incident" && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-bad-soft p-4 font-medium text-bad">
            <input type="checkbox" name="urgent" className="size-5 accent-[var(--bad)]" />
            This is urgent (danger, water leak, someone stuck)
          </label>
        )}
        {kind === "incident" && <p className="hint">In an emergency, call 112 first.</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Photos <span className="font-normal text-muted">· optional, up to {MAX_PHOTOS}</span></h2>
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong/70 p-5 text-center font-medium text-ink-2 transition-colors hover:border-brand hover:bg-surface-2">
          <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand-text"><Camera aria-hidden className="size-5" /></span>
          Take a photo or choose from your phone
          <input ref={fileRef} type="file" name="photos" accept="image/*" multiple capture="environment" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {preparing && <p role="status" className="hint">Preparing your photos…</p>}
        {tooMany && <Notice tone="warn">Only the first {MAX_PHOTOS} photos will be sent.</Notice>}
        {previews.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {previews.map((p) => (
                <li key={p.url}><img src={p.url} alt={`Photo: ${p.name}`} className="aspect-square w-full rounded-xl object-cover" /></li>
              ))}
            </ul>
            <button type="button" onClick={clearPhotos} className="inline-flex w-fit items-center gap-1 text-[0.9375rem] font-medium text-bad hover:underline"><X className="size-4" aria-hidden /> Remove photos</button>
          </>
        )}
      </Card>

      <button disabled={pending || preparing} type="submit" className={buttonClass("primary", "lg", "w-full sm:w-auto sm:self-end sm:px-8")}>
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
