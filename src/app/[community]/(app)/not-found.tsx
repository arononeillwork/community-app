"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SearchX } from "lucide-react";

/** Shown inside the app when a record doesn't exist or isn't yours to see. */
export default function AppNotFound() {
  const { community } = useParams<{ community: string }>();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted ring-1 ring-line"><SearchX aria-hidden className="size-5" /></span>
      <h1 className="mt-4 text-[1.5rem] font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-1 text-muted">It may have been removed, or it isn&apos;t shared with you.</p>
      <Link href={`/${community}/home`} className="mt-6 text-[0.9375rem] font-medium no-underline hover:underline">Back to home</Link>
    </div>
  );
}
