"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Notice } from "@/components/ui";
import { PLACE_TYPES } from "@/components/info/labels";
import { suggestPlace } from "./actions";

export default function SuggestPlaceForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(suggestPlace.bind(null, slug), undefined);
  const v = state?.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* key: refresh the fields after each submit (cleared on success, refilled after an error). */}
      <div key={state?.at ?? 0} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="sp-name">Name of the place</label>
          <input id="sp-name" name="name" required maxLength={120} className="input" defaultValue={v.name} placeholder="e.g. Bakery on the corner" />
        </div>
        <div className="field">
          <label htmlFor="sp-type">What kind of place is it?</label>
          <select id="sp-type" name="place_type" required className="input" defaultValue={v.place_type ?? ""}>
            <option value="" disabled>Choose one</option>
            {PLACE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.one}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sp-description">Why do you recommend it? <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="sp-description" name="description" maxLength={1000} className="input" defaultValue={v.description} />
        </div>
        <div className="field">
          <label htmlFor="sp-address">Address or how to find it <span className="font-normal text-muted">(optional)</span></label>
          <input id="sp-address" name="address" maxLength={200} className="input" defaultValue={v.address} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="sp-phone">Phone <span className="font-normal text-muted">(optional)</span></label>
            <input id="sp-phone" name="phone" type="tel" inputMode="tel" maxLength={25} className="input" defaultValue={v.phone} />
          </div>
          <div className="field">
            <label htmlFor="sp-website">Website <span className="font-normal text-muted">(optional)</span></label>
            <input id="sp-website" name="website" maxLength={300} className="input" defaultValue={v.website} placeholder="www.example.com" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sp-distance">About how far is it from here? <span className="font-normal text-muted">(optional)</span></label>
          <input id="sp-distance" name="distance_km" inputMode="decimal" maxLength={6} className="input sm:max-w-48" defaultValue={v.distance_km} aria-describedby="sp-distance-hint" />
          <p id="sp-distance-hint" className="hint">In kilometres, for example 1.5</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">Can you get in without steps? (wheelchair, walker or pram)</legend>
          {[
            { value: "yes", label: "Yes, no steps" },
            { value: "no", label: "No, there are steps" },
            { value: "", label: "I am not sure" },
          ].map((o) => (
            <label key={o.value || "unknown"} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line px-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="step_free" value={o.value} defaultChecked={(v.step_free ?? "") === o.value} className="size-6 accent-[var(--brand)]" />
              {o.label}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="sp-access">Anything else about access? <span className="font-normal text-muted">(optional)</span></label>
          <input id="sp-access" name="accessibility_notes" maxLength={500} className="input" defaultValue={v.accessibility_notes} placeholder="e.g. Ramp at the side door, accessible toilet" />
        </div>
      </div>

      {/* Messages sit next to the button, where the person is looking after sending. */}
      {state?.ok && (
        <Notice tone="ok">Thank you! “{state.name}” has been added to the list for your neighbours.</Notice>
      )}
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <button disabled={pending} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-lg font-bold text-brand-ink disabled:opacity-60 sm:w-fit">
        <Send aria-hidden className="size-5" /> {pending ? "Sending…" : "Send suggestion"}
      </button>
    </form>
  );
}
