"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, Mic, Plus, SendHorizontal, Sparkles, Square } from "lucide-react";
import clsx from "clsx";
import { ask, startConversation } from "@/lib/assistant/actions";
import type { ChatMessage } from "@/lib/assistant/types";
import { Card, Notice, PageHeader, buttonClass } from "@/components/ui";
import Answer, { AssistantMark } from "./Answer";
import { useDictation } from "./useDictation";

const SUGGESTIONS = [
  "When is glass collected?",
  "Who is our block representative?",
  "How do I report a leak?",
  "When is the next meeting?",
  "What are the pool hours?",
  "Where is the nearest pharmacy?",
];

type Props = {
  slug: string;
  communityName: string;
  firstName: string;
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
  aiOn: boolean;
  prefill?: string;
  speechLang: string;
};

export default function Chat({ slug, communityName, firstName, initialConversationId, initialMessages, aiOn, prefill, speechLang }: Props) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [resetting, startReset] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(initialMessages.length);
  const dictation = useDictation(speechLang, (text) => setInput(text));

  // Grow the text box with its content (up to about eight lines).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input]);

  // Bring the newest message into view when one is added (not on first load).
  useEffect(() => {
    if (messages.length > count.current || busy) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("rm");
      end.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
    }
    count.current = messages.length;
  }, [messages.length, busy]);

  // Coming back to a conversation: show the latest answer, like any chat. On larger screens, put the
  // cursor in the box straight away.
  useEffect(() => {
    let frame = 0;
    if (count.current > 0) frame = requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end" }));
    if (window.matchMedia("(min-width: 1024px)").matches) box.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, []);

  function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    if (dictation.listening) dictation.stop();
    setError(null);
    const temp: ChatMessage = { id: `pending-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString(), meta: null };
    setMessages((m) => [...m, temp]);
    setInput("");
    startBusy(async () => {
      const r = await ask(slug, conversationId, text);
      if (r.ok) {
        setConversationId(r.conversationId);
        setMessages((m) => [...m.filter((x) => x.id !== temp.id), r.question, r.answer]);
      } else {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setInput(text);
        setError(r.error);
      }
      box.current?.focus();
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function newConversation() {
    setError(null);
    startReset(async () => {
      const r = await startConversation(slug);
      if (r.ok) {
        setConversationId(r.conversationId);
        setMessages([]);
        count.current = 0;
        setInput("");
        box.current?.focus();
      } else setError(r.error);
    });
  }

  const empty = messages.length === 0;

  return (
    <>
      <PageHeader
        title="Ask a question"
        intro={`Bins, rules, meetings, the local area or who to call at ${communityName}.`}
        actions={!empty ? (
          <button type="button" onClick={newConversation} disabled={resetting || busy} className={buttonClass("secondary", "md")}>
            <Plus aria-hidden className="size-4" /> Start a new conversation
          </button>
        ) : undefined}
      />

      {empty ? (
        <Card className="mb-4">
          <div className="flex flex-col items-center px-2 pb-2 text-center">
            <span className="mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand-text">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <h2 className="text-[1.0625rem] font-semibold">{firstName ? `What would you like to know, ${firstName}?` : "What would you like to know?"}</h2>
            <p className="mt-1 max-w-md text-[0.9375rem] text-muted">Type a question in your own words, or pick one of these.</p>
          </div>
          <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => send(s)} disabled={busy}
                  className="min-h-10 rounded-full border border-line bg-surface px-4 py-2 text-left text-[0.9375rem] text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-text disabled:opacity-50">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <ol role="log" aria-live="polite" aria-label="Conversation" className="mb-4 flex flex-col gap-5">
          {messages.map((m) => (
            <li key={m.id}>
              {m.role === "user" ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-brand-ink">
                    <span className="sr-only">You: </span>{m.content}
                  </p>
                </div>
              ) : (
                <Answer message={m} slug={slug} />
              )}
            </li>
          ))}
          {busy && (
            <li className="flex gap-3" aria-live="off">
              <AssistantMark />
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-card">
                <span className="sr-only">Looking that up…</span>
                {[0, 150, 300].map((d) => (
                  <span key={d} aria-hidden className="size-2 rounded-full bg-muted/60 motion-safe:animate-pulse" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </li>
          )}
        </ol>
      )}
      <div className="sticky bottom-0 z-10 -mx-1 bg-linear-to-t from-bg from-75% to-transparent px-1 pb-3 pt-4">
        {error && <div className="mb-3"><Notice tone="bad">{error}</Notice></div>}
        <form onSubmit={onSubmit} className="rounded-card border border-line-strong/50 bg-surface p-2 shadow-card focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20">
          <div className="flex items-center justify-between gap-3 px-2 pt-1">
            <label htmlFor="question" className="text-sm font-medium text-ink-2">Your question</label>
            <span className="hidden text-xs text-muted sm:block">Enter to send · Shift + Enter for a new line</span>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              id="question"
              ref={box}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1000}
              placeholder={dictation.listening ? "Listening…" : "e.g. Pool opening hours"}
              className="max-h-60 min-h-12 flex-1 resize-none bg-transparent px-2 py-2.5 text-[1.0625rem] leading-normal text-ink outline-none placeholder:text-muted/80"
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start(input))}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? "Stop dictation" : "Dictate your question"}
                title={dictation.listening ? "Stop dictation" : "Dictate your question"}
                className={clsx("grid size-12 shrink-0 place-items-center rounded-[10px] transition-colors",
                  dictation.listening ? "bg-bad-soft text-bad" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
              >
                {dictation.listening ? <Square aria-hidden className="size-4 fill-current" /> : <Mic aria-hidden className="size-5" />}
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} className={buttonClass("primary", "lg", "px-4 sm:px-5")}>
              <SendHorizontal aria-hidden className="size-4" />
              <span className="max-sm:sr-only">Send</span>
            </button>
          </div>
        </form>
        {dictation.problem && <p role="status" className="mt-2 px-1 text-sm text-muted">{dictation.problem}</p>}
        {!aiOn && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-sm text-muted">
            <BookOpen aria-hidden className="size-3.5 shrink-0" /> Answers come from your community&apos;s information.
          </p>
        )}
      </div>
      {/* Scroll target after the composer, so the newest answer ends above it rather than under it. */}
      <div ref={end} />
    </>
  );
}
