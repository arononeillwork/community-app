import Image from "next/image";
import Link from "next/link";
import { getCommunityOr404 } from "@/lib/community";
import LoginForms from "./LoginForms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { community } = await params;
  const { error } = await searchParams;
  const c = await getCommunityOr404(community);
  const initialError = error === "not_member" ? "You're not registered in this community. Please contact the administrator."
    : error === "link" ? "That sign-in link has expired. Please ask for a new one." : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg, var(--brand-soft), var(--bg))" }}>
      <div className="card w-full max-w-md rounded-card border border-line bg-surface p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {c.branding?.logo_url && <Image src={c.branding.logo_url} alt="" width={64} height={64} className="size-16 rounded-2xl object-contain" />}
          <h1 className="text-2xl font-bold">Sign in to {c.name}</h1>
        </div>
        <LoginForms slug={c.slug} initialError={initialError} />
        <p className="mt-6 text-center">
          <Link href={`/${c.slug}`} className="font-bold text-brand underline">← Back to {c.name}</Link>
        </p>
        {process.env.NODE_ENV !== "production" && (
          <details className="mt-6 rounded-xl bg-bg p-3 text-sm">
            <summary className="cursor-pointer font-bold">Local test accounts</summary>
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
