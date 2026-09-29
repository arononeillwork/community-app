import Image from "next/image";
import { cookies } from "next/headers";
import { Clock, MapPin, Megaphone, Phone } from "lucide-react";
import { getCommunityOr404, t } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card } from "@/components/ui";
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {c.branding?.logo_url && <Image src={c.branding.logo_url} alt="" width={48} height={48} className="size-12 rounded-xl object-contain" />}
            <span className="text-xl font-bold">{c.name}</span>
          </div>
          <QuickControls languages={c.enabled_languages} current={lang} />
        </div>
      </header>

      <section
        className="relative overflow-hidden text-brand-ink"
        style={{
          background: c.branding?.hero_image_url
            ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${c.branding.hero_image_url}) center/cover`
            : "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 60%, #0c4a6e))",
          color: c.branding?.hero_image_url ? "#fff" : undefined,
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-14 sm:py-20">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{c.name}</h1>
          <p className="max-w-2xl text-xl sm:text-2xl">{t(info?.tagline, lang)}</p>
          <div className="flex flex-wrap gap-3">
            {user ? (
              <Button href={`/${c.slug}/home`} size="lg" className="!bg-white !text-ink">Go to my community →</Button>
            ) : (
              <Button href={`/${c.slug}/login`} size="lg" className="!bg-white !text-ink">Sign in</Button>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-2xl font-bold">Welcome</h2>
          <p className="text-lg">{t(info?.welcome, lang)}</p>
          {info?.address && (
            <p className="mt-4 flex items-start gap-2 text-lg">
              <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-brand" />
              <span>{info.address}</span>
            </p>
          )}
          {info?.lat && info?.lng && (
            <a className="mt-2 inline-block font-bold text-brand underline" target="_blank" rel="noopener noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${info.lat}&mlon=${info.lng}#map=17/${info.lat}/${info.lng}`}>
              Show on map
            </a>
          )}
        </Card>

        <Card className="border-2 !border-bad/40">
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold"><Phone aria-hidden className="size-6 text-bad" /> Important numbers</h2>
          <ul className="flex flex-col gap-2">
            {(info?.emergency_contacts ?? []).map((e) => (
              <li key={e.label}>
                <a href={`tel:${e.phone.replace(/\s/g, "")}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 no-underline hover:border-brand">
                  <span>{e.label}</span>
                  <span className="tabular text-xl font-bold text-ink">{e.phone}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold"><Clock aria-hidden className="size-6 text-brand" /> Opening hours</h2>
          <dl className="flex flex-col gap-2">
            {(info?.office_hours ?? []).map((h) => (
              <div key={h.label} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
                <dt className="font-bold">{h.label}</dt>
                <dd className="tabular">{h.hours}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold"><Megaphone aria-hidden className="size-6 text-brand" /> Notices</h2>
          {(info?.public_notices ?? []).length === 0 ? (
            <p className="text-muted">No notices at the moment.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {info!.public_notices.map((n) => (
                <li key={n.title} className="rounded-xl bg-brand-soft p-4">
                  <div className="text-sm font-bold text-muted">{date(n.date)}</div>
                  <div className="text-lg font-bold">{n.title}</div>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>

      <footer className="mt-auto border-t border-line bg-surface py-6 text-center text-muted">
        {c.name} · Community app
      </footer>
    </div>
  );
}
