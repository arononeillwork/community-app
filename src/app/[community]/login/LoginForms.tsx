"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { sendMagicLink, signInWithPassword } from "./actions";
import { Notice, buttonClass } from "@/components/ui";

export default function LoginForms({ slug, initialError }: { slug: string; initialError?: string }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink.bind(null, slug), undefined);
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword.bind(null, slug), undefined);
  const error = (mode === "link" ? linkState?.error : pwState?.error) ?? initialError;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line" role="tablist" aria-label="How to sign in">
        {(["link", "password"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={clsx("min-h-10 rounded-lg text-[0.9375rem] font-medium transition-colors",
              mode === m ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}>
            {m === "link" ? "Email me a link" : "Use a password"}
          </button>
        ))}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {mode === "link" ? (
        linkState?.sent ? (
          <Notice tone="ok" title="Check your email">We&apos;ve sent a sign-in link to {linkState.sent}. Open the email and tap the link.</Notice>
        ) : (
          <form action={linkAction} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="email-link">Email address</label>
              <input id="email-link" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
              <p className="hint">No password needed. We&apos;ll email you a link to sign in.</p>
            </div>
            <button disabled={linkPending} type="submit" className={buttonClass("primary", "lg", "w-full")}>
              {linkPending ? "Sending…" : "Send me a sign-in link"}
            </button>
          </form>
        )
      ) : (
        <form action={pwAction} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="email-pw">Email address</label>
            <input id="email-pw" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <button disabled={pwPending} type="submit" className={buttonClass("primary", "lg", "w-full")}>
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
