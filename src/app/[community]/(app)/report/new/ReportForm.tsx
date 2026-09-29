"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { createReport } from "../actions";
import { Card, Notice } from "@/components/ui";

type Opt = { id: string; label?: string; name?: string };

export default function ReportForm({ slug, categories, units }: { slug: string; categories: Opt[]; units: Opt[] }) {
  const [state, action, pending] = useActionState(createReport.bind(null, slug), undefined);
  const [kind, setKind] = useState<"incident" | "complaint">("incident");
  const [target, setTarget] = useState("common_area");
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFiles(files: FileList | null) {
    setPreviews(Array.from(files ?? []).slice(0, 5).map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
  }

  function clearPhotos() {
    if (fileRef.current) fileRef.current.value = "";
    setPreviews([]);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xl font-bold">1. What kind of problem?</legend>
          {[
            { v: "incident", t: "Something is broken or dangerous", d: "e.g. a leak, broken light, lift stuck, damaged gate" },
            { v: "complaint", t: "A complaint", d: "e.g. noise, parking, pets, cleaning not done" },
          ].map((o) => (
            <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${kind === o.v ? "border-brand bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="kind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v as typeof kind)} className="mt-1 size-6 accent-[var(--brand)]" />
              <span><span className="block text-lg font-bold">{o.t}</span><span className="text-muted">{o.d}</span></span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Tell us about it</h2>
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
          <label className="flex items-center gap-3 rounded-xl border-2 border-bad/40 bg-bad-soft p-4 font-bold">
            <input type="checkbox" name="urgent" className="size-6 accent-[var(--bad)]" />
            This is urgent (danger, water leak, someone stuck)
          </label>
        )}
        {kind === "incident" && <p className="hint">In an emergency, call 112 first.</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Add photos <span className="font-normal text-muted">(optional, up to 5)</span></h2>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-5 text-center font-bold hover:border-brand">
          <Camera aria-hidden className="size-10 text-brand" />
          Take a photo or choose from your phone
          <input ref={fileRef} type="file" name="photos" accept="image/*" multiple capture="environment" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {previews.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {previews.map((p) => (
                <li key={p.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview of a file picked in the browser; next/image cannot load blob URLs */}
                  <img src={p.url} alt={`Photo: ${p.name}`} className="aspect-square w-full rounded-xl object-cover" />
                </li>
              ))}
            </ul>
            <button type="button" onClick={clearPhotos} className="inline-flex w-fit items-center gap-1 font-bold text-bad underline"><X className="size-4" aria-hidden /> Remove photos</button>
          </>
        )}
      </Card>

      <button disabled={pending} className="min-h-16 rounded-xl bg-brand text-xl font-bold text-brand-ink disabled:opacity-60">
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
