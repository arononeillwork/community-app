"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { SaveButton } from "@/components/people/choices";
import { submitKeepingValues } from "@/components/people/submit";
import { saveDetails } from "./actions";

export default function DetailsForm({ slug, initial, email }: {
  slug: string;
  initial: { full_name: string; phone: string };
  email: string;
}) {
  const [state, action, pending] = useActionState(saveDetails.bind(null, slug), undefined);
  const [fullName, setFullName] = useState(initial.full_name);
  const [phone, setPhone] = useState(initial.phone);
  const norm = (x: string) => x.trim().replace(/\s+/g, " ");
  const dirty = norm(fullName) !== norm(initial.full_name) || phone.trim() !== initial.phone.trim();

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="flex flex-col gap-5">
      <div className="field">
        <label htmlFor="full_name">Your name</label>
        <input id="full_name" name="full_name" className="input" required minLength={2} maxLength={100}
          autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <p className="hint">This is how other residents and the office will see you.</p>
      </div>

      <div className="field">
        <label htmlFor="phone">Your phone number</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" className="input" maxLength={24}
          autoComplete="tel" placeholder="+34 600 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="hint">Please include the country code (for example +34 for Spain) so calls and WhatsApp work. Leave empty if you prefer not to give one.</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-bold">Your email address</span>
        <span className="break-all text-lg">{email || "Not set"}</span>
        <p className="hint">You use this email to sign in. To change it, please contact the community office.</p>
      </div>

      <div className="flex flex-col gap-3">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        {state?.ok && !dirty && !pending && <Notice tone="ok">{state.ok}</Notice>}
        {dirty && !pending && <p className="font-bold text-warn">You have changes that are not saved yet.</p>}
        <SaveButton pending={pending}>Save my details</SaveButton>
      </div>
    </form>
  );
}
