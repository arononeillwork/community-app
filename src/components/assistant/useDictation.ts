"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Dictation with the browser's Web Speech API, where it exists (Chrome, Edge, Safari).
   Elsewhere `supported` stays false and the microphone button is not shown. */

type Alternative = { transcript: string };
type Result = { isFinal: boolean; 0: Alternative; length: number };
type ResultEvent = { resultIndex: number; results: { length: number; [i: number]: Result } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: ResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(lang: string, onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; });

  useEffect(() => {
    setSupported(!!ctor());
    return () => rec.current?.abort();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback((prefix: string) => {
    const C = ctor();
    if (!C) return;
    setProblem(null);
    const r = new C();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    const lead = prefix.trim() ? prefix.trim() + " " : "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onTextRef.current(lead + text.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setProblem("Allow the microphone in your browser to dictate.");
      else if (e.error === "no-speech") setProblem("I didn't hear anything. Try again, a little closer to the microphone.");
      else if (e.error !== "aborted") setProblem("Dictation stopped. You can type your question instead.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  return { supported, listening, problem, start, stop };
}
