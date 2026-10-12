"use client";

import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { Card, Notice, buttonClass } from "@/components/ui";
import { ChoiceCard, Choices, Field, fieldProps } from "@/components/library/Field";
import { PLACE_TYPES, PLACE_TYPE_SINGULAR, PRICE_WORDS } from "@/components/library/meta";
import { savePlace, suggestPlace, type PlaceField, type PlaceFormState } from "./actions";

export type PlaceValues = Record<PlaceField, string>;

const PRICED = ["restaurant", "cafe"];
const ROUTES = ["walk", "route"];

/** One form for residents' suggestions and for the office (which also sets distance and map position). */
export default function PlaceForm({ slug, id, mode, initial }: {
  slug: string; id: string | null; mode: "suggest" | "admin"; initial: PlaceValues;
}) {
  const action = mode === "suggest" ? suggestPlace.bind(null, slug) : savePlace.bind(null, slug, id);
  const [state, formAction, pending] = useActionState<PlaceFormState, FormData>(action, undefined);
  const [, startTransition] = useTransition();
  const [v, setV] = useState<PlaceValues>(initial);
  const set = (k: PlaceField) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const err = (k: PlaceField) => state?.fields?.[k];
  const admin = mode === "admin";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">The place</h2>
        <Field id="name" label="Name" error={err("name")}>
          <input {...fieldProps("name", err("name"))} className="input" maxLength={80} value={v.name} onChange={set("name")} placeholder="e.g. Café Plaza" />
        </Field>
        <Field id="place_type" label="What kind of place" error={err("place_type")}>
          <select {...fieldProps("place_type", err("place_type"))} className="input" value={v.place_type} onChange={set("place_type")}>
            <option value="">Choose one</option>
            {PLACE_TYPES.map((t) => <option key={t.key} value={t.key}>{PLACE_TYPE_SINGULAR[t.key]}</option>)}
          </select>
        </Field>
        <Field id="description" label="Why go there" error={err("description")} hint="One or two sentences. What is it good for?">
          <textarea {...fieldProps("description", err("description"), true)} className="input !min-h-24" maxLength={280} value={v.description} onChange={set("description")}
            placeholder="e.g. Friendly café on the church square with good coffee and churros in the morning." />
        </Field>
        {PRICED.includes(v.place_type) && (
          <Choices id="price_level" legend="Prices" error={err("price_level")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {["", "1", "2", "3", "4"].map((p) => (
                <ChoiceCard key={p || "unknown"} checked={v.price_level === p} className="items-center py-3">
                  <input type="radio" name="price_level" value={p} checked={v.price_level === p} onChange={set("price_level")} className="size-5 shrink-0 accent-[var(--brand)]" />
                  <span className="text-ink">{p ? <><span aria-hidden className="tabular">{"€".repeat(Number(p))}</span><span className="sr-only">{PRICE_WORDS[Number(p)]}</span></> : "Not sure"}</span>
                </ChoiceCard>
              ))}
            </div>
          </Choices>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Finding it</h2>
        <Field id="address" label="Address or meeting point" optional error={err("address")}>
          <input {...fieldProps("address", err("address"))} className="input" maxLength={120} value={v.address} onChange={set("address")} placeholder="e.g. Plaza de la Iglesia" />
        </Field>
        {admin && (
          <>
            <Field id="distance_km" label="Distance from the community" optional error={err("distance_km")} hint="In kilometres, e.g. 0.4 for 400 m.">
              <input {...fieldProps("distance_km", err("distance_km"), true)} className="input sm:max-w-40" inputMode="decimal" value={v.distance_km} onChange={set("distance_km")} placeholder="0.4" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="lat" label="Latitude" optional error={err("lat")} hint="Makes directions exact. Copy it from Google Maps.">
                <input {...fieldProps("lat", err("lat"), true)} className="input tabular" inputMode="decimal" value={v.lat} onChange={set("lat")} placeholder="36.4843" />
              </Field>
              <Field id="lng" label="Longitude" optional error={err("lng")}>
                <input {...fieldProps("lng", err("lng"))} className="input tabular" inputMode="decimal" value={v.lng} onChange={set("lng")} placeholder="-4.9906" />
              </Field>
            </div>
          </>
        )}
        {(ROUTES.includes(v.place_type) || v.route_url) && (
          <Field id="route_url" label="Route map link" optional error={err("route_url")} hint="A Google Maps, Wikiloc or similar link for the route.">
            <input {...fieldProps("route_url", err("route_url"), true)} className="input" type="url" inputMode="url" maxLength={500} value={v.route_url} onChange={set("route_url")} placeholder="https://" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="phone" label="Phone" optional error={err("phone")}>
            <input {...fieldProps("phone", err("phone"))} className="input" type="tel" inputMode="tel" maxLength={30} value={v.phone} onChange={set("phone")} placeholder="+34 952 111 222" />
          </Field>
          <Field id="website" label="Website" optional error={err("website")}>
            <input {...fieldProps("website", err("website"))} className="input" type="url" inputMode="url" maxLength={500} value={v.website} onChange={set("website")} placeholder="https://" />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Getting in</h2>
        <Choices id="step_free" legend="Step-free access" error={err("step_free")} hint="No steps from the street, or a ramp or lift.">
          <div className="grid grid-cols-3 gap-2">
            {/* Three short answers side by side, also on phones: the selected one is filled and ticked. */}
            {[{ v: "yes", t: "Yes" }, { v: "no", t: "No" }, { v: "", t: "Not sure" }].map((o) => {
              const checked = v.step_free === o.v;
              return (
                <label key={o.v || "unknown"}
                  className={clsx("flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]",
                    checked ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-surface-2")}>
                  <input type="radio" name="step_free" value={o.v} checked={checked} onChange={set("step_free")} className="sr-only" />
                  {checked && <Check aria-hidden className="size-4 shrink-0" />}
                  <span>{o.t}</span>
                </label>
              );
            })}
          </div>
        </Choices>
        <Field id="accessibility_notes" label="Access notes" optional error={err("accessibility_notes")}>
          <input {...fieldProps("accessibility_notes", err("accessibility_notes"))} className="input" maxLength={200} value={v.accessibility_notes} onChange={set("accessibility_notes")}
            placeholder="e.g. Ramp from the promenade" />
        </Field>
      </Card>

      <button disabled={pending} type="submit" className={buttonClass("primary", "lg", "w-full sm:w-auto sm:self-end sm:px-8")}>
        {pending ? "Saving…" : mode === "suggest" ? "Share this place" : id ? "Save changes" : "Add place"}
      </button>
    </form>
  );
}
