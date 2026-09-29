"use client";

import { useActionState } from "react";
import { proposeTopic, type FormState } from "@/app/[community]/(app)/meetings/actions";
import { Notice } from "@/components/ui";
import SubmitButton from "./SubmitButton";
import { buttonClass } from "./meeting-utils";

/** "Suggest a topic" form for every member. */
export default function TopicForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<FormState, FormData>(proposeTopic.bind(null, slug), undefined);
  const v = state?.values;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <div className="field">
        <label htmlFor="topic-title">Your topic</label>
        <input id="topic-title" name="title" required minLength={3} maxLength={200} className="input"
          defaultValue={v?.title ?? ""} placeholder="e.g. Solar panels on the roofs" />
      </div>
      <div className="field">
        <label htmlFor="topic-description">More details <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="topic-description" name="description" maxLength={3000} className="input"
          defaultValue={v?.description ?? ""} placeholder="Why is this important? What would you like to happen?" />
        <p className="hint">Everyone in the community can see your topic and your name.</p>
      </div>
      <div>
        <SubmitButton className={buttonClass("primary", "lg")} pendingLabel="Sending…">Suggest this topic</SubmitButton>
      </div>
    </form>
  );
}
