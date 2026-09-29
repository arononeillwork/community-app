import type { ReactNode } from "react";
import { Accessibility, ShieldCheck, UserRound } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { languageOption } from "@/components/people/languages";
import DisplayForm, { type DisplayValues } from "./DisplayForm";
import DetailsForm from "./DetailsForm";
import SharingForm, { type SharingValues } from "./SharingForm";

export const metadata = { title: "Settings" };

const FONT_SCALES = [100, 125, 150, 175, 200];
const SPEECH_RATES = [0.8, 1.0, 1.2];
const NOTIFY_CHANNELS = ["email", "whatsapp", "push"];
const CONTACT_METHODS = ["phone", "whatsapp", "email", "letter"];
const VISIBILITIES = ["admins", "unit", "all"];

function Section({ id, title, intro, icon, children }: { id: string; title: string; intro: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="card scroll-mt-40 rounded-card border border-line bg-surface p-5 sm:p-6">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-2xl font-bold">{icon} {title}</h2>
      <p className="mb-6 mt-1 text-muted">{intro}</p>
      {children}
    </section>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();

  const [{ data: prefs }, { data: profile }, { data: contact }] = await Promise.all([
    supabase.from("user_preferences")
      .select("font_scale, high_contrast, reduce_motion, dyslexia_font, language, speech_rate, voice_enabled, simple_mode, notify_channel")
      .eq("profile_id", s.userId).maybeSingle(),
    supabase.from("profiles").select("full_name, phone").eq("id", s.userId).maybeSingle(),
    supabase.from("contact_preferences").select("preferred_method, best_times, visibility")
      .eq("profile_id", s.userId).eq("community_id", s.community.id).maybeSingle(),
  ]);

  const codes = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language || "en"];
  const languages = codes.map((code) => ({ code, label: languageOption(code) }));
  const fallbackLang = codes.includes(s.community.default_language) ? s.community.default_language : codes[0];

  const rate = Number(prefs?.speech_rate ?? 1);
  const nearestRate = SPEECH_RATES.reduce((best, x) => (Math.abs(x - rate) < Math.abs(best - rate) ? x : best), 1.0);
  const fontScale = Number(prefs?.font_scale ?? 100);

  const display: DisplayValues = {
    font_scale: FONT_SCALES.includes(fontScale) ? fontScale : 100,
    high_contrast: !!prefs?.high_contrast,
    reduce_motion: !!prefs?.reduce_motion,
    dyslexia_font: !!prefs?.dyslexia_font,
    simple_mode: prefs ? !!prefs.simple_mode : true,
    language: prefs?.language && codes.includes(prefs.language) ? prefs.language : fallbackLang,
    notify_channel: prefs?.notify_channel && NOTIFY_CHANNELS.includes(prefs.notify_channel) ? prefs.notify_channel : "email",
    speech_rate: nearestRate,
    voice_enabled: prefs ? !!prefs.voice_enabled : true,
  };

  const sharing: SharingValues = {
    preferred_method: contact?.preferred_method && CONTACT_METHODS.includes(contact.preferred_method) ? contact.preferred_method : "email",
    best_times: contact?.best_times ?? "",
    visibility: contact?.visibility && VISIBILITIES.includes(contact.visibility) ? contact.visibility : "unit",
  };

  const phone = (profile?.phone ?? "").trim();
  const jump = [
    { href: "#display", label: "Text size and display" },
    { href: "#details", label: "My details" },
    { href: "#sharing", label: "Who can see my details" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Settings"
        intro="Make the app easier to read and use, keep your details up to date, and choose what other residents can see about you."
      />

      <nav aria-label="Settings sections" className="no-print -mt-4">
        <ul className="flex flex-wrap gap-2">
          {jump.map((j) => (
            <li key={j.href}>
              <a href={j.href}
                className="inline-flex min-h-12 items-center rounded-xl border-2 border-line-strong bg-surface px-4 font-bold text-ink no-underline hover:bg-bg">
                {j.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="display" title="Text size and display" icon={<Accessibility aria-hidden className="size-7" />}
        intro="Make the app easier to see, read and use. Your choices are used on every page as soon as you save.">
        <DisplayForm
          slug={s.community.slug}
          initial={display}
          languages={languages}
          whatsappEnabled={s.community.settings?.features?.whatsapp === true}
          hasPhone={!!phone}
        />
      </Section>

      <Section id="details" title="My details" icon={<UserRound aria-hidden className="size-7" />}
        intro="Your name and phone number.">
        <DetailsForm
          slug={s.community.slug}
          initial={{ full_name: profile?.full_name ?? s.fullName, phone }}
          email={s.email}
        />
      </Section>

      <Section id="sharing" title="Who can see my contact details" icon={<ShieldCheck aria-hidden className="size-7" />}
        intro="Choose how neighbours should contact you, and who can see your phone number and email.">
        <SharingForm
          slug={s.community.slug}
          initial={sharing}
          hasPhone={!!phone}
          hasSaved={!!contact}
          isAdmin={s.isAdmin}
          isOwner={s.isOwner}
          isTenant={s.isTenant}
        />
      </Section>
    </div>
  );
}
