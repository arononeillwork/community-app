"use client";

import { useFormAction } from "./useFormAction";
import { useState } from "react";
import { Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import FlatSelect, { type BlockFlats } from "./FlatSelect";
import TenancyFields from "./TenancyFields";

type State = { error?: string } | undefined;

/** Link an existing person to a flat as owner or tenant. */
export default function LinkFlatForm({ action, blocks, today }: {
  action: (prev: State, form: FormData) => Promise<State>;
  blocks: BlockFlats[];
  today: string;
}) {
  const { state, formProps } = useFormAction(action);
  const [relation, setRelation] = useState("owner");

  return (
    <form {...formProps} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <fieldset className="min-w-0 flex flex-wrap gap-2">
        <legend className="label mb-2">They are the</legend>
        {[{ v: "owner", t: "Owner" }, { v: "tenant", t: "Tenant" }].map((o) => (
          <label key={o.v} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border px-4 transition-colors ${relation === o.v ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
            <input type="radio" name="relation" value={o.v} checked={relation === o.v} onChange={() => setRelation(o.v)} className="size-4 accent-[var(--brand)]" />
            <span className="font-medium text-ink">{o.t}</span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="link-unit">Flat</label>
        <FlatSelect id="link-unit" blocks={blocks} />
      </div>
      {relation === "tenant" && <TenancyFields idPrefix="link" today={today} />}
      <div><SubmitButton pendingLabel="Saving…">{relation === "owner" ? "Add as owner" : "Add tenancy"}</SubmitButton></div>
    </form>
  );
}
