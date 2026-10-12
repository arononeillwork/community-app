"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";

/** Calm fallback when a page fails to load (for example a brief database hiccup). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { community } = useParams<{ community: string }>();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-warn-soft text-warn"><TriangleAlert aria-hidden className="size-5" /></span>
      <h1 className="mt-4 text-[1.5rem] font-semibold">This page didn&apos;t load</h1>
      <p className="mt-1 text-muted">Please try again. If it keeps happening, let the office know.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" href={`/${community}/home`}>Go to home</Button>
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand px-4 text-[0.9375rem] font-medium text-brand-ink hover:brightness-110">
          <RotateCcw aria-hidden className="size-4" /> Try again
        </button>
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted">Reference: {error.digest}</p>}
    </div>
  );
}
