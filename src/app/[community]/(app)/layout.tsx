import Link from "next/link";
import { Bell, Home, Settings } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import NavLinks from "./NavLinks";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("community_id", s.community.id).is("read_at", null);
  const base = `/${s.community.slug}`;

  const links = [
    { href: `${base}/home`, label: "Home" },
    { href: `${base}/report`, label: "Report" },
    { href: `${base}/meetings`, label: "Meetings" },
    { href: `${base}/info`, label: "Bins & info" },
    { href: `${base}/contacts`, label: "Contacts" },
    ...(s.isOwner ? [{ href: `${base}/my-units`, label: "My flat" }] : []),
    ...(s.isFinance ? [{ href: `${base}/finance`, label: "Finance" }] : []),
    ...(s.isAdmin ? [{ href: `${base}/admin`, label: "Admin" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3 focus:font-bold">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <Link href={`${base}/home`} className="flex items-center gap-3 no-underline text-ink">
            {s.community.branding?.logo_url && <img src={s.community.branding.logo_url} alt="" className="size-10 rounded-xl" />}
            <span className="text-lg font-bold">{s.community.name}</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href={`${base}/home`} className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-xl px-2 text-xs font-bold no-underline text-ink hover:bg-bg sm:hidden">
              <Home aria-hidden className="size-6" /> Home
            </Link>
            <Link href={`${base}/notifications`} className="relative flex min-h-12 min-w-12 flex-col items-center justify-center rounded-xl px-2 text-xs font-bold no-underline text-ink hover:bg-bg">
              <Bell aria-hidden className="size-6" /> Alerts
              {!!unread && <span className="absolute right-1 top-0 rounded-full bg-bad px-1.5 text-xs text-white">{unread}<span className="sr-only"> unread</span></span>}
            </Link>
            <Link href={`${base}/settings`} className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-xl px-2 text-xs font-bold no-underline text-ink hover:bg-bg">
              <Settings aria-hidden className="size-6" /> Settings
            </Link>
            <form action={signOut.bind(null, s.community.slug)}>
              <button className="ml-1 min-h-12 rounded-xl border-2 border-line px-3 text-sm font-bold hover:bg-bg">Sign out</button>
            </form>
          </div>
        </div>
        <NavLinks links={links} />
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-line bg-surface py-4 text-center text-sm text-muted">
        Signed in as {s.fullName || s.email} · {s.roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(", ")}
      </footer>
    </div>
  );
}
