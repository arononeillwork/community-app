"use client";

import { useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import { ChevronUp } from "lucide-react";

/** Upvote toggle for a suggested topic: shows the count, pressed when you support it. */
export function VoteButton({ title, votes, voted, canVote, action }: {
  title: string;
  votes: number;
  voted: boolean;
  /** False once the topic is no longer open (count only). */
  canVote: boolean;
  action: (voted: boolean) => Promise<{ error?: string }>;
}) {
  const [state, setState] = useOptimistic({ votes, voted });
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      setState({ votes: state.votes + (state.voted ? -1 : 1), voted: !state.voted });
      const res = await action(state.voted);
      if (res?.error) setError(res.error);
    });
  }

  const count = <span className="text-[0.9375rem] font-semibold leading-none tabular">{state.votes}</span>;

  if (!canVote) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-xl bg-surface-2 py-2 text-muted"
        title={`${state.votes} ${state.votes === 1 ? "vote" : "votes"}`}>
        <ChevronUp aria-hidden className="size-4" />
        {count}
        <span className="sr-only">{state.votes === 1 ? "vote" : "votes"}</span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center self-start">
      <button type="button" onClick={toggle} aria-pressed={state.voted}
        aria-label={`${state.voted ? "Remove your vote for" : "Vote for"} “${title}”, ${state.votes} ${state.votes === 1 ? "vote" : "votes"}`}
        title={state.voted ? "Remove your vote" : "Vote for this topic"}
        className={clsx(
          "flex min-h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-colors",
          state.voted ? "border-brand bg-brand-soft text-brand-text" : "border-line bg-surface text-ink-2 hover:border-brand-line hover:bg-surface-2",
        )}>
        <ChevronUp aria-hidden className="size-4" strokeWidth={2.5} />
        {count}
      </button>
      {error && <p role="alert" className="mt-1 w-24 text-center text-xs text-bad">{error}</p>}
    </div>
  );
}
