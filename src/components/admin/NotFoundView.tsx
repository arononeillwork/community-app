"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Home, SearchX } from "lucide-react";
import { btn } from "./styles";

/**
 * Friendly "not found" screen. It works out whether the community in the address exists:
 *  - known community, missing page  → "We couldn't find that page" + button to that community's home
 *  - unknown community               → "We couldn't find that community" + the list of communities
 */
export default function NotFoundView({ communities }: { communities: { slug: string; name: string }[] }) {
  const params = useParams<{ community?: string }>();
  const pathname = usePathname() ?? "/";
  const fromPath = pathname.split("/").filter(Boolean)[0] ?? "";
  const slug = typeof params?.community === "string" ? params.community : safeDecode(fromPath);
  const known = communities.find((c) => c.slug === slug);

  if (known) {
    return (
      <Screen
        title="We couldn't find that page"
        text={`This page does not exist in ${known.name}, or it may have been moved or removed.`}
        action={{ href: `/${known.slug}/home`, label: `Go to the ${known.name} home page` }}
      />
    );
  }

  return (
    <Screen
      title={slug ? "We couldn't find that community" : "We couldn't find that page"}
      text={slug
        ? "Please check the address. It may be spelled differently, or the community may no longer use this app."
        : "The page may have been moved or removed."}
      action={{ href: "/", label: "Go to the home page" }}
    >
      {communities.length > 0 && (
        <nav aria-labelledby="nf-communities" className="mt-8 w-full max-w-xl text-left">
          <h2 id="nf-communities" className="mb-3 text-2xl font-bold">Looking for one of these?</h2>
          <ul className="flex flex-col gap-2">
            {communities.map((c) => (
              <li key={c.slug}>
                <Link href={`/${c.slug}`}
                  className="flex min-h-14 items-center rounded-xl border-2 border-line bg-surface px-4 text-lg font-bold text-ink no-underline hover:border-ink">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Screen>
  );
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function Screen({ title, text, action, children }: {
  title: string;
  text: string;
  action: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <SearchX aria-hidden className="mb-6 size-20 text-muted" strokeWidth={1.5} />
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-xl text-xl text-muted">{text}</p>
      <Link href={action.href} className={btn("primary", "lg", "mt-8")}>
        <Home aria-hidden className="size-6" /> {action.label}
      </Link>
      {children}
    </main>
  );
}
