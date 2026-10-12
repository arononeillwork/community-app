"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Card, Notice, buttonClass } from "@/components/ui";
import { GROUP_LABELS, VISIBILITY_LABELS, type ContactGroup, type ContactVisibility } from "@/components/people/KeyContactLine";
import { saveContact, type ContactField, type ContactFormState } from "./actions";

export type ContactValues = Record<ContactField, string>;
export type MemberOption = { id: string; name: string; phone: string | null; email: string | null; detail: string };

const GROUP_ORDER: ContactGroup[] = ["committee", "management", "staff", "services", "emergency"];
// The database shows "admins" rows to administrators and the treasurer (can_see), so say so.
const VISIBILITY_HINTS: Record<ContactVisibility, string> = {
  all: "Every resident",
  owners: "Owners, not tenants",
  admins: "Office and treasurer",
};

export default function ContactForm({ slug, id, initial, blocks, members }: {
  slug: string; id: string | null; initial: ContactValues; blocks: { id: string; name: string }[]; members: MemberOption[];
}) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(saveContact.bind(null, slug, id), undefined);
  const [, startTransition] = useTransition();
  const [v, setV] = useState<ContactValues>(initial);
  const set = (k: ContactField) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const err = (k: ContactField) => state?.fields?.[k];
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed save, take the person to the first field that needs fixing (the summary is far above on phones).
  useEffect(() => {
    if (!state?.error) return;
    const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    if (first) first.focus();
    else formRef.current?.querySelector<HTMLElement>("[data-form-error]")?.focus();
  }, [state]);

  function chooseMember(pid: string) {
    const m = members.find((x) => x.id === pid);
    setV((cur) => ({
      ...cur,
      profile_id: pid,
      ...(m ? { name: m.name, phone: m.phone ?? cur.phone, email: m.email ?? cur.email } : {}),
    }));
  }

  // Submit without React's automatic form reset, so everything typed stays put when the server asks for a fix.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  const field = (k: ContactField, label: string, input: ReactNode, hint?: string, className?: string) => (
    <div className={clsx("field", className)}>
      <label htmlFor={k}>{label}</label>
      {input}
      {err(k) ? <p id={`${k}-error`} className="text-sm text-bad">{err(k)}</p> : hint ? <p id={`${k}-hint`} className="hint">{hint}</p> : null}
    </div>
  );
  const aria = (k: ContactField, hint?: boolean) => ({
    id: k, name: k, "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `${k}-error` : hint ? `${k}-hint` : undefined,
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state?.error && <div data-form-error tabIndex={-1} className="rounded-xl outline-none"><Notice tone="bad">{state.error}</Notice></div>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">The role</h2>
        {field("role_title", "Role", (
          <input {...aria("role_title", true)} className="input" maxLength={80} value={v.role_title} onChange={set("role_title")} placeholder="e.g. Concierge" />
        ), "As residents would say it: Concierge, President, Block A representative.")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contact_group", "Group", (
            <select {...aria("contact_group")} className="input" value={v.contact_group} onChange={set("contact_group")}>
              <option value="">Choose a group</option>
              {GROUP_ORDER.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
            </select>
          ))}
          {field("building_id", "Block", (
            <select {...aria("building_id", true)} className="input" value={v.building_id} onChange={set("building_id")}>
              <option value="">Whole community</option>
              {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ), "A block contact is shown to that block only.")}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[1.0625rem] font-semibold">Who</h2>
        {field("profile_id", "Linked member (optional)", (
          <select {...aria("profile_id", true)} className="input" value={v.profile_id} onChange={(e) => chooseMember(e.target.value)}>
            <option value="">Not a member, e.g. a company</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.detail ? ` · ${m.detail}` : ""}</option>)}
          </select>
        ), "Choose the resident who holds this role. Their name, phone and email are filled in for you.")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Name", (
            <input {...aria("name")} className="input" maxLength={120} autoComplete="off" value={v.name} onChange={set("name")} placeholder="e.g. Miguel Torres" />
          ))}
          {field("organisation", "Organisation", (
            <input {...aria("organisation")} className="input" maxLength={120} autoComplete="off" value={v.organisation} onChange={set("organisation")} placeholder="e.g. Conserjería Integral" />
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-[1.0625rem] font-semibold">How to reach them</h2>
          <p className="mt-0.5 text-[0.9375rem] text-muted">Add at least one: phone, WhatsApp or email.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", "Phone", (
            <input {...aria("phone", true)} type="tel" inputMode="tel" autoComplete="off" className="input" value={v.phone} onChange={set("phone")} placeholder="+34 600 100 200" />
          ), "Include the country code.")}
          <div className="field">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="whatsapp" className="label">WhatsApp</label>
              {v.phone && v.whatsapp !== v.phone && (
                <button type="button" onClick={() => setV((cur) => ({ ...cur, whatsapp: cur.phone }))}
                  className="text-sm font-medium text-brand-text underline-offset-4 hover:underline">Same as phone</button>
              )}
            </div>
            <input {...aria("whatsapp", true)} type="tel" inputMode="tel" autoComplete="off" className="input" value={v.whatsapp} onChange={set("whatsapp")} placeholder="+34 600 100 200" />
            {err("whatsapp") ? <p id="whatsapp-error" className="text-sm text-bad">{err("whatsapp")}</p> : <p id="whatsapp-hint" className="hint">Leave empty if they do not use WhatsApp.</p>}
          </div>
        </div>
        {field("email", "Email", (
          <input {...aria("email")} type="email" inputMode="email" autoComplete="off" className="input" value={v.email} onChange={set("email")} placeholder="name@example.com" />
        ))}
        {field("hours", "Hours", (
          <input {...aria("hours", true)} className="input" maxLength={80} value={v.hours} onChange={set("hours")} placeholder="e.g. Mon – Fri 09:00 – 14:00" />
        ), "When residents can reach them.")}
        {field("notes", "Note", (
          <textarea {...aria("notes", true)} className="input !min-h-20" rows={2} maxLength={300} value={v.notes} onChange={set("notes")}
            placeholder="e.g. At the main gate. First call for leaks and lifts." />
        ), "One short line shown under the name.")}
      </Card>

      <Card className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-3 text-[1.0625rem] font-semibold">Who can see it</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {(Object.keys(VISIBILITY_LABELS) as ContactVisibility[]).map((k) => (
              <label key={k} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                v.visibility === k ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2")}>
                <input type="radio" name="visibility" value={k} checked={v.visibility === k} onChange={set("visibility")} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{VISIBILITY_LABELS[k]}</span>
                  <span className="block text-sm text-muted">{VISIBILITY_HINTS[k]}</span>
                </span>
              </label>
            ))}
          </div>
          {err("visibility") && <p className="mt-2 text-sm text-bad">{err("visibility")}</p>}
        </fieldset>
        {field("sort", "Display order", (
          <input {...aria("sort", true)} type="number" inputMode="numeric" min={0} max={9999} step={1} className="input sm:max-w-[10rem]" value={v.sort} onChange={set("sort")} />
        ), "Lower numbers come first within each group.")}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={`/${slug}/contacts`} className={buttonClass("ghost", "lg")}>Cancel</Link>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Saving…" : "Save contact"}
        </button>
      </div>
    </form>
  );
}
