"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertTriangle, Bell, BookOpen, CalendarDays, Coins, Contact, FileText, Home, KeyRound, LogOut, Map, Menu,
  PiggyBank, Settings, Sparkles, Trash2, Users, Wrench, X, type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { telHref } from "@/components/contact";

export const NAV_ICONS = {
  home: Home, ask: Sparkles, report: AlertTriangle, meetings: CalendarDays, info: Trash2, local: Map,
  documents: FileText, members: Users, contacts: Contact, myflat: KeyRound, money: PiggyBank,
  finance: Coins, admin: Wrench, guide: BookOpen,
} satisfies Record<string, LucideIcon>;
export type NavIcon = keyof typeof NAV_ICONS;

export type NavItem = { href: string; label: string; icon: NavIcon; badge?: number; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

type Props = {
  children: ReactNode;
  community: { name: string; slug: string; logo: string | null };
  user: { name: string; email: string; roleLabel: string };
  groups: NavGroup[];
  unread: number;
  help: { title: string; name: string | null; phone: string; hours: string | null } | null;
  signOut: () => Promise<void>;
};

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}

function Brand({ community }: { community: Props["community"] }) {
  return (
    <Link href={`/${community.slug}/home`} className="flex min-w-0 items-center gap-3 rounded-xl text-ink no-underline">
      {community.logo
        ? <img src={community.logo} alt="" className="size-9 shrink-0 rounded-[10px]" />
        : <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand font-semibold text-brand-ink">{community.name[0]}</span>}
      <span className="truncate text-[1.0625rem] font-semibold tracking-tight">{community.name}</span>
    </Link>
  );
}

function SidebarNav({ groups, path }: { groups: NavGroup[]; path: string }) {
  return (
    <nav aria-label="Main" className="scroll-quiet flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className={clsx(gi > 0 && "mt-5")}>
          {g.label && <div className="px-3 pb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted">{g.label}</div>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const Icon = NAV_ICONS[it.icon];
              const on = isActive(path, it);
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={on ? "page" : undefined}
                    className={clsx("group flex min-h-10 items-center gap-3 rounded-[10px] px-3 py-2 text-[0.9375rem] font-medium no-underline transition-colors",
                      on ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                    <Icon aria-hidden strokeWidth={2} className={clsx("size-[1.15rem] shrink-0", on ? "text-brand-text" : "text-muted group-hover:text-ink-2")} />
                    <span className="truncate">{it.label}</span>
                    {!!it.badge && (
                      <span className="ml-auto rounded-full bg-bad px-1.5 text-xs font-semibold leading-5 text-white tabular">
                        {it.badge}<span className="sr-only"> new</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function HelpCard({ help }: { help: NonNullable<Props["help"]> }) {
  return (
    <div className="mx-3 mb-3 rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{help.title}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{help.name ?? help.title}</div>
          {help.hours && <div className="truncate text-xs text-muted">{help.hours}</div>}
        </div>
        <a href={telHref(help.phone)} className="inline-flex min-h-9 shrink-0 items-center rounded-[10px] bg-brand px-3 text-sm font-medium text-brand-ink no-underline hover:brightness-110"
          aria-label={`Call the ${help.title.toLowerCase()} on ${help.phone}`}>
          Call
        </a>
      </div>
    </div>
  );
}

function AccountMenu({ user, slug, signOut }: { user: Props["user"]; slug: string; signOut: Props["signOut"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        aria-label={`Account: ${user.name || user.email}`} title="Account"
        className="grid size-10 place-items-center rounded-full transition-shadow hover:ring-4 hover:ring-surface-2">
        <Avatar name={user.name || user.email} size="sm" className="!size-9" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Avatar name={user.name || user.email} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{user.name || "Your account"}</div>
              <div className="truncate text-sm text-muted">{user.email}</div>
              <div className="mt-0.5 text-xs text-muted">{user.roleLabel}</div>
            </div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href={`/${slug}/settings`} onClick={() => setOpen(false)}
              className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.9375rem] text-ink-2 no-underline hover:bg-surface-2 hover:text-ink">
              <Settings aria-hidden className="size-4" /> Settings and text size
            </Link>
            <form action={signOut}>
              <button role="menuitem" className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] text-ink-2 hover:bg-surface-2 hover:text-ink">
                <LogOut aria-hidden className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children, community, user, groups, unread, help, signOut }: Props) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const base = `/${community.slug}`;

  // Close the phone menu whenever the page changes, and on Escape.
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5"><Brand community={community} /></div>
        <SidebarNav groups={groups} path={path} />
        {help && <HelpCard help={help} />}
      </aside>

      {/* Phone / tablet drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-surface shadow-pop">
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 pl-5 pr-3">
              <Brand community={community} />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" title="Close menu"
                className="grid size-10 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <SidebarNav groups={groups} path={path} />
            {help && <HelpCard help={help} />}
          </aside>
        </div>
      )}

      <div className="lg:pl-[var(--sidebar-w)]">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6 lg:px-10">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" title="Menu"
              className="grid size-10 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 lg:hidden">
              <Menu aria-hidden className="size-5" />
            </button>
            <div className="min-w-0 lg:hidden"><Brand community={community} /></div>

            <Link href={`${base}/ask`}
              className="hidden h-10 min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-2 px-4 text-[0.9375rem] text-muted no-underline transition-colors hover:border-brand-line hover:text-ink-2 lg:flex">
              <Sparkles aria-hidden className="size-4 shrink-0 text-brand-text" />
              <span className="truncate">Ask about {community.name}…</span>
            </Link>

            <div className="ml-auto flex items-center gap-1">
              <Link href={`${base}/notifications`} aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"} title="Alerts"
                className="relative grid size-10 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                <Bell aria-hidden className="size-[1.2rem]" />
                {!!unread && (
                  <span className="absolute right-1 top-1 min-w-[1.1rem] rounded-full bg-bad px-1 text-center text-[0.6875rem] font-semibold leading-[1.1rem] text-white ring-2 ring-surface tabular">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href={`${base}/settings`} aria-label="Settings" title="Settings"
                className="grid size-10 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                <Settings aria-hidden className="size-[1.2rem]" />
              </Link>
              <AccountMenu user={user} slug={community.slug} signOut={signOut} />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
