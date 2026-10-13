import { cookies } from "next/headers";
import { ArrowRight, Clock, MapPin, Megaphone, Phone } from "lucide-react";
import { getCommunityOr404, t } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, SectionHeader } from "@/components/ui";
import { telHref } from "@/components/contact";
import QuickControls from "@/components/QuickControls";
import { date } from "@/lib/format";

/** Public, white-labelled landing page for one community. */
export default async function Landing({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const c = await getCommunityOr404(community);
  const lang = (await cookies()).get("lang")?.value ?? c.default_language;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const info = c.info;
  const cta = user
    ? { href: `/${c.slug}/home`, label: "Go to my community" }
    : { href: `/${c.slug}/login`, label: "Sign in" };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {c.branding?.logo_url && <img src={c.branding.logo_url} alt="" className="size-9 rounded-[10px]" />}
            <span className="truncate text-[1.0625rem] font-semibold tracking-tight">{c.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickControls languages={c.enabled_languages} current={lang} />
            <span className="hidden sm:block"><Button href={cta.href} size="sm">{cta.label}</Button></span>
          </div>
        </div>
      </header>

      <section
        className="relative overflow-hidden"
        style={{
          background: c.branding?.hero_image_url
            ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${c.branding.hero_image_url}) center/cover`
            : "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--brand) 88%, white) 0%, var(--brand) 45%, color-mix(in srgb, var(--brand) 70%, #082f49) 100%)",
          color: c.branding?.hero_image_url ? "#fff" : "var(--brand-ink)",
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-[0.9375rem] font-medium opacity-85">Welcome to</p>
          <h1 className="-mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-inherit sm:text-[3.5rem]" style={{ color: "inherit" }}>{c.name}</h1>
          <p className="max-w-xl text-lg opacity-90 sm:text-xl">{t(info?.tagline, lang)}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button href={cta.href} size="lg" className="!bg-white !text-[#111827] hover:!brightness-95">
              {cta.label} <ArrowRight aria-hidden className="size-4" />
            </Button>
            {info?.address && (
              <span className="inline-flex items-center gap-2 text-[0.9375rem] opacity-90">
                <MapPin aria-hidden className="size-4" /> {info.address}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <h2 className="text-[1.25rem] font-semibold">About {c.name}</h2>
            <p className="mt-2 text-ink-2">{t(info?.welcome, lang)}</p>
            {info?.lat && info?.lng && (
              <a className="mt-3 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium no-underline hover:underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${info.lat}&mlon=${info.lng}#map=17/${info.lat}/${info.lng}`}>
                <MapPin aria-hidden className="size-4" /> Show on a map
              </a>
            )}
          </Card>

          <Card>
            <SectionHeader icon={Megaphone} title="Notices" />
            {(info?.public_notices ?? []).length === 0 ? (
              <p className="text-muted">No notices at the moment.</p>
            ) : (
              <ul className="divide-y divide-line">
                {info!.public_notices.map((n) => (
                  <li key={n.title} className="py-3 first:pt-0 last:pb-0">
                    <div className="text-sm text-muted">{date(n.date)}</div>
                    <div className="font-medium">{n.title}</div>
                    <p className="text-[0.9375rem] text-ink-2">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card padded={false}>
            <div className="p-5 pb-2 sm:p-6 sm:pb-2">
              <SectionHeader icon={Phone} title="Important numbers" description="Tap a number to call" className="!mb-2" />
            </div>
            <ul className="divide-y divide-line">
              {(info?.emergency_contacts ?? []).map((e, i) => (
                <li key={e.label}>
                  <a href={telHref(e.phone)} className="flex min-h-14 items-center justify-between gap-3 px-5 py-2.5 text-ink no-underline transition-colors hover:bg-surface-2 sm:px-6">
                    <span className="text-[0.9375rem] text-ink-2">{e.label}</span>
                    <span className={`tabular whitespace-nowrap font-semibold ${i === 0 ? "text-bad" : "text-ink"}`}>{e.phone}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionHeader icon={Clock} title="Opening hours" />
            <dl className="divide-y divide-line">
              {(info?.office_hours ?? []).map((h) => (
                <div key={h.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 text-[0.9375rem]">
                  <dt className="text-ink-2">{h.label}</dt>
                  <dd className="tabular font-medium text-ink">{h.hours}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </main>

      <footer className="mt-auto border-t border-line bg-surface py-6 text-center text-sm text-muted">
        {c.name} · Community app
      </footer>
    </div>
  );
}
