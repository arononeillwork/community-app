"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, Notice, buttonClass } from "@/components/ui";
import { ChoiceCard, Choices, Field, fieldProps } from "@/components/library/Field";
import { WEEK, weekdaysInWords } from "@/components/library/meta";
import { inkFor } from "@/lib/color";
import { saveBin, type BinField, type BinFormState } from "./actions";

export type BinValues = Omit<Record<BinField, string>, "weekdays"> & { weekdays: number[] };

const HEX = /^#[0-9a-f]{6}$/i;

export default function BinForm({ slug, id, initial }: { slug: string; id: string | null; initial: BinValues }) {
  const [state, formAction, pending] = useActionState<BinFormState, FormData>(saveBin.bind(null, slug, id), undefined);
  const [, startTransition] = useTransition();
  const [v, setV] = useState<BinValues>(initial);
  const set = (k: Exclude<BinField, "weekdays">) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const err = (k: BinField) => state?.fields?.[k];
  const swatch = HEX.test(v.color_hex) ? v.color_hex : "#64748b";

  function toggleDay(day: number) {
    setV((cur) => ({ ...cur, weekdays: cur.weekdays.includes(day) ? cur.weekdays.filter((d) => d !== day) : [...cur.weekdays, day] }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}

      <Card className="flex flex-col gap-4">
        <Field id="bin_type" label="Bin" error={err("bin_type")} hint="What goes in it, as residents would say it.">
          <input {...fieldProps("bin_type", err("bin_type"), true)} className="input" maxLength={60} value={v.bin_type} onChange={set("bin_type")} placeholder="e.g. Paper and cardboard" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="color" label="Colour" error={err("color")} hint="The word residents know it by.">
            <input {...fieldProps("color", err("color"), true)} className="input" maxLength={30} value={v.color} onChange={set("color")} placeholder="e.g. blue" />
          </Field>
          <Field id="color_hex" label="Colour on screen" error={err("color_hex")} hint="Pick it, or type it as #2563eb.">
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Pick the colour" value={swatch} onChange={(e) => setV((cur) => ({ ...cur, color_hex: e.target.value }))}
                className="h-[2.875rem] w-14 shrink-0 cursor-pointer rounded-[10px] border border-line-strong bg-surface p-1" />
              <input {...fieldProps("color_hex", err("color_hex"), true)} className="input tabular" maxLength={7} value={v.color_hex} onChange={set("color_hex")} placeholder="#2563eb" spellCheck={false} autoCapitalize="none" />
            </div>
          </Field>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3" aria-live="polite">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/10" style={{ background: swatch, color: inkFor(swatch) }}>
            <Trash2 className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{v.bin_type || "Bin name"}</div>
            <div className="text-sm text-muted">{v.color ? `${v.color.charAt(0).toUpperCase()}${v.color.slice(1)} bin` : "Colour"} · {weekdaysInWords(v.weekdays)}</div>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <Choices id="weekdays" legend="Collection days" error={err("weekdays")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WEEK.map((d) => {
              const checked = v.weekdays.includes(d.value);
              return (
                <ChoiceCard key={d.value} checked={checked} className="items-center py-3">
                  <input type="checkbox" name="weekdays" value={d.value} checked={checked} onChange={() => toggleDay(d.value)} className="size-5 shrink-0 accent-[var(--brand)]" />
                  <span className="font-medium text-ink">{d.long}</span>
                </ChoiceCard>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setV((cur) => ({ ...cur, weekdays: WEEK.map((d) => d.value) }))}>Every day</button>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setV((cur) => ({ ...cur, weekdays: [] }))}>Clear</button>
          </div>
        </Choices>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="put_out_time" label="When to put it out" optional error={err("put_out_time")}>
            <input {...fieldProps("put_out_time", err("put_out_time"))} className="input" maxLength={60} value={v.put_out_time} onChange={set("put_out_time")} placeholder="e.g. After 20:00" />
          </Field>
          <Field id="location" label="Where" optional error={err("location")}>
            <input {...fieldProps("location", err("location"))} className="input" maxLength={100} value={v.location} onChange={set("location")} placeholder="e.g. Bin area by the main gate" />
          </Field>
        </div>
        <Field id="notes" label="Tip for residents" optional error={err("notes")}>
          <input {...fieldProps("notes", err("notes"))} className="input" maxLength={300} value={v.notes} onChange={set("notes")} placeholder="e.g. Flatten boxes." />
        </Field>
        <Field id="sort" label="Order" error={err("sort")} hint="Lower numbers come first.">
          <input {...fieldProps("sort", err("sort"), true)} type="number" inputMode="numeric" min={0} max={999} className="input sm:max-w-40" value={v.sort} onChange={set("sort")} />
        </Field>
      </Card>

      <button disabled={pending} type="submit" className={buttonClass("primary", "lg", "w-full sm:w-auto sm:self-end sm:px-8")}>
        {pending ? "Saving…" : id ? "Save changes" : "Add bin"}
      </button>
    </form>
  );
}
