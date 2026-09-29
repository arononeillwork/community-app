"use client";

import { useActionState, useState } from "react";
import { Eye, MessageSquare } from "lucide-react";
import { Notice } from "@/components/ui";
import { RadioCard, SaveButton } from "@/components/people/choices";
import { submitKeepingValues } from "@/components/people/submit";
import { saveSharing } from "./actions";

export type SharingValues = { preferred_method: string; best_times: string; visibility: string };

const METHODS = [
  { value: "phone", title: "Phone call", description: "People ring your phone number." },
  { value: "whatsapp", title: "WhatsApp", description: "People send you a WhatsApp message or call you on WhatsApp." },
  { value: "email", title: "Email", description: "People write to your email address." },
  { value: "letter", title: "Letter", description: "A note through your letterbox, or left for you at the office." },
];

export default function SharingForm({ slug, initial, hasPhone, hasSaved, isAdmin, isOwner, isTenant }: {
  slug: string;
  initial: SharingValues;
  hasPhone: boolean;
  hasSaved: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isTenant: boolean;
}) {
  const [state, action, pending] = useActionState(saveSharing.bind(null, slug), undefined);
  const [v, setV] = useState<SharingValues>(initial);
  const set = <K extends keyof SharingValues>(key: K, value: SharingValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const norm = (x: string) => x.trim().replace(/\s+/g, " ");
  const dirty = v.preferred_method !== initial.preferred_method || v.visibility !== initial.visibility
    || norm(v.best_times) !== norm(initial.best_times);

  // "unit" means: the landlord of a tenant, or the tenants of an owner (plus the administrators).
  const unitTitle = isTenant && !isOwner ? "My landlord and the committee"
    : isOwner && !isTenant ? "My tenants and the committee"
    : "My landlord / my tenants and the committee";
  const unitDescription = isTenant && !isOwner
    ? "The owner of the flat you rent, and the community administrators."
    : isOwner && !isTenant
      ? "The people who rent your flat, and the community administrators."
      : "The owner of the flat you rent or the people who rent your flat, and the community administrators.";

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="flex flex-col gap-6">
      <p className="rounded-xl border-2 border-info/30 bg-info-soft px-4 py-3 text-ink">
        Everyone in the community can always see your name, your flat and how you prefer to be contacted.
        Your phone number, email and best times are only shown to the people you choose below.
      </p>

      {/* How to contact me */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <MessageSquare aria-hidden className="size-6" /> How do you prefer to be contacted?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {METHODS.map((m) => (
            <RadioCard
              key={m.value}
              name="preferred_method"
              value={m.value}
              checked={v.preferred_method === m.value}
              onChange={() => set("preferred_method", m.value)}
              title={m.title}
              description={m.description}
            />
          ))}
        </div>
        {(v.preferred_method === "phone" || v.preferred_method === "whatsapp") && !hasPhone && (
          <Notice tone="warn">You have not added a phone number yet. Please add it under “My details” above, so people can reach you.</Notice>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="best_times">Best times to contact me</label>
        <input id="best_times" name="best_times" className="input" maxLength={120}
          placeholder="e.g. Weekday mornings" value={v.best_times} onChange={(e) => set("best_times", e.target.value)} />
        <p className="hint">For example “Weekday mornings” or “After 18:00”. Leave empty if any time is fine.</p>
      </div>

      {/* Who can see */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Eye aria-hidden className="size-6" /> Who can see my phone number, email and best times?
        </legend>
        <RadioCard
          name="visibility"
          value="admins"
          checked={v.visibility === "admins"}
          onChange={() => set("visibility", "admins")}
          title="Only the committee"
          description="Only the community administrators. Nobody else."
        />
        <RadioCard
          name="visibility"
          value="unit"
          checked={v.visibility === "unit"}
          onChange={() => set("visibility", "unit")}
          title={unitTitle}
          description={unitDescription}
        />
        <RadioCard
          name="visibility"
          value="all"
          checked={v.visibility === "all"}
          onChange={() => set("visibility", "all")}
          title="All residents"
          description="Everyone who lives in or owns a flat here can see them on the Contacts page."
        />
        {!hasSaved && (
          <p className="hint">You have not chosen yet. Until you save a choice, the second option is used.</p>
        )}
        {isAdmin && (
          <p className="rounded-xl border-2 border-warn/30 bg-warn-soft px-4 py-3 font-bold text-ink">
            Because you are an administrator, residents can always see your phone number and email, whatever you choose here.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-3">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        {state?.ok && !dirty && !pending && <Notice tone="ok">{state.ok}</Notice>}
        {dirty && !pending && <p className="font-bold text-warn">You have changes that are not saved yet.</p>}
        <SaveButton pending={pending}>Save sharing choices</SaveButton>
      </div>
    </form>
  );
}
