import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCommunityOr404, safeNext } from "@/lib/community";
import LoginForms from "./LoginForms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { community } = await params;
  const { error, next } = await searchParams;
  const c = await getCommunityOr404(community);
  const initialError = error === "not_member" ? "You're not registered in this community. Please contact the administrator."
    : error === "link" ? "That link didn't work. It may have expired or already been used. Enter your email below and we'll send you a new one." : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(90% 60% at 50% 0%, var(--brand-soft), var(--bg) 70%)" }}>
      <div className="w-full max-w-[26rem]">
        <div className="card rounded-[20px] border border-line bg-surface p-6 shadow-pop sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            {c.branding?.logo_url && <img src={c.branding.logo_url} alt="" className="size-14 rounded-2xl" />}
            <div>
              <h1 className="text-[1.5rem] font-semibold leading-tight">Sign in</h1>
              <p className="mt-1 text-[0.9375rem] text-muted">to {c.name}</p>
            </div>
          </div>
          <LoginForms slug={c.slug} initialError={initialError} next={safeNext(next) ?? undefined} />
        </div>
        <p className="mt-5 text-center">
          <Link href={`/${c.slug}`} className="inline-flex items-center gap-1 text-[0.9375rem] font-medium text-muted no-underline hover:text-ink">
            <ChevronLeft aria-hidden className="size-4" /> Back to {c.name}
          </Link>
        </p>
        {process.env.NODE_ENV !== "production" && (
          <details className="mt-5 rounded-xl border border-dashed border-line bg-surface/60 p-3 text-sm text-ink-2">
            <summary className="cursor-pointer font-medium">Local test accounts</summary>
            <p className="mt-2">Password for all: <code>Password123!</code></p>
            <ul className="mt-1 list-disc pl-5">
              <li>admin@oceanagardens.test (admin)</li>
              <li>treasurer@oceanagardens.test (treasurer + owner)</li>
              <li>owner1@oceanagardens.test … owner19 (owners)</li>
              <li>tenant1@oceanagardens.test … tenant8 (tenants)</li>
              <li>platform@communityapp.test (platform admin)</li>
              <li>admin@demoheights.test (other community)</li>
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}
