"use client";

import { useActionState } from "react";
import { addOwnerNote } from "../actions";
import { Notice, buttonClass } from "@/components/ui";

export default function OwnerNoteForm({ slug, id }: { slug: string; id: string }) {
  const [state, action, pending] = useActionState(addOwnerNote.bind(null, slug, id), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <div className="field">
        <label htmlFor="body">Note for the office</label>
        <textarea id="body" name="body" className="input" maxLength={2000} required
          placeholder="e.g. My tenant is away this week. I've asked the plumber to check the pipe on Thursday." />
      </div>
      <div><button type="submit" disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Sending…" : "Send to the office"}</button></div>
    </form>
  );
}
