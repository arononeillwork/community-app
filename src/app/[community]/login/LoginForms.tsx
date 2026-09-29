"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword } from "./actions";
import { Notice } from "@/components/ui";

export default function LoginForms({ slug, initialError }: { slug: string; initialError?: string }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink.bind(null, slug), undefined);
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword.bind(null, slug), undefined);
  const error = (mode === "link" ? linkState?.error : pwState?.error) ?? initialError;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-bg p-1" role="tablist">
        {(["link", "password"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`min-h-12 rounded-lg font-bold ${mode === m ? "bg-surface shadow-sm" : "text-muted"}`}>
            {m === "link" ? "Email me a link" : "Use a password"}
          </button>
        ))}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {mode === "link" ? (
        linkState?.sent ? (
          <Notice tone="ok">We&apos;ve sent a sign-in link to {linkState.sent}. Open your email and tap the link.</Notice>
        ) : (
          <form action={linkAction} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="email-link">Your email address</label>
              <input id="email-link" name="email" type="email" autoComplete="email" required className="input" />
              <p className="hint">No password needed — we&apos;ll email you a link to sign in.</p>
            </div>
            <button disabled={linkPending} className="min-h-14 rounded-xl bg-brand text-lg font-bold text-brand-ink disabled:opacity-60">
              {linkPending ? "Sending…" : "Send me a sign-in link"}
            </button>
          </form>
        )
      ) : (
        <form action={pwAction} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="email-pw">Email address</label>
            <input id="email-pw" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <button disabled={pwPending} className="min-h-14 rounded-xl bg-brand text-lg font-bold text-brand-ink disabled:opacity-60">
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
