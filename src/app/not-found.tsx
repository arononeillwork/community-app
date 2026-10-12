import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted ring-1 ring-line"><SearchX aria-hidden className="size-5" /></span>
      <h1 className="mt-4 text-[1.5rem] font-semibold">Page not found</h1>
      <p className="mt-1 text-muted">Check the address, or start again from your community&apos;s page.</p>
      <Link href="/" className="mt-6 text-[0.9375rem] font-medium no-underline hover:underline">Find your community</Link>
    </main>
  );
}
