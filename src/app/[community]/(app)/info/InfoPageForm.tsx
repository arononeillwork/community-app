"use client";

import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { Card, Notice, buttonClass } from "@/components/ui";
import { ChoiceCard, Choices, Field, fieldProps } from "@/components/library/Field";
import {
  INFO_CATEGORIES, INFO_ICONS, INFO_ICON_KEYS, VISIBILITIES, VISIBILITY_HINTS, VISIBILITY_LABELS,
} from "@/components/library/meta";
import { saveInfoPage, type InfoField, type InfoFormState } from "./actions";

export type InfoValues = Record<InfoField, string>;

export default function InfoPageForm({ slug, id, initial }: { slug: string; id: string | null; initial: InfoValues }) {
  const [state, formAction, pending] = useActionState<InfoFormState, FormData>(saveInfoPage.bind(null, slug, id), undefined);
  const [, startTransition] = useTransition();
  const [v, setV] = useState<InfoValues>(initial);
  const set = (k: InfoField) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const err = (k: InfoField) => state?.fields?.[k];

  // Keep what was typed when the server asks for a fix (no automatic form reset).
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <Field id="title" label="Title" error={err("title")} hint="Short, as residents would say it: Swimming pool, Parking.">
          <input {...fieldProps("title", err("title"), true)} className="input" maxLength={80} value={v.title} onChange={set("title")} placeholder="e.g. Swimming pool" />
        </Field>
        <Field id="category" label="Section" error={err("category")} hint="Emergency information is always shown first.">
          <select {...fieldProps("category", err("category"), true)} className="input" value={v.category} onChange={set("category")}>
            {INFO_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Choices id="icon" legend="Icon" error={err("icon")}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {INFO_ICON_KEYS.map((k) => {
              const { icon: Icon, label } = INFO_ICONS[k];
              const checked = v.icon === k;
              return (
                <label key={k} className={clsx("flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center text-xs transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]",
                  checked ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2 hover:bg-surface-2")}>
                  <input type="radio" name="icon" value={k} checked={checked} onChange={() => setV((cur) => ({ ...cur, icon: k }))} className="sr-only" />
                  <Icon aria-hidden className="size-5" />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </Choices>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field id="body" label="What residents need to know" error={err("body")}
          hint="Short lines read best. Start a line with • or - to make a list, and end a short line with : to make a heading.">
          <textarea {...fieldProps("body", err("body"), true)} className="input min-h-56" maxLength={5000} value={v.body} onChange={set("body")}
            placeholder={"Open May to October, 10:00 – 20:00.\n• Shower before swimming.\n• No glass in the pool area."} />
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
        <Field id="sort" label="Order" error={err("sort")} hint="Lower numbers come first within the section.">
          <input {...fieldProps("sort", err("sort"), true)} type="number" inputMode="numeric" min={0} max={999} className="input sm:max-w-40" value={v.sort} onChange={set("sort")} />
        </Field>
      </Card>

      <button disabled={pending} type="submit" className={buttonClass("primary", "lg", "w-full sm:w-auto sm:self-end sm:px-8")}>
        {pending ? "Saving…" : id ? "Save changes" : "Add information"}
      </button>
    </form>
  );
}
