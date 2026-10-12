import { Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { centsToInput } from "@/lib/format";
import { Card, Notice, PageHeader, SectionHeader } from "@/components/ui";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import Toggle from "@/components/admin/Toggle";
import PublicInfoForm from "@/components/admin/PublicInfoForm";
import BrandingForm from "@/components/admin/BrandingForm";
import { LANGUAGES, dayInput } from "@/components/admin/format";
import { saveBranding, savePublicInfo, saveSettings } from "./actions";

export const metadata = { title: "Community profile" };

const SAVED: Record<string, string> = {
  landing: "Landing page saved.",
  branding: "Branding saved. Every page now uses the new look.",
  settings: "Settings saved.",
};

export default async function CommunityProfilePage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { community } = await params;
  const { saved } = await searchParams;
  const s = await requireAdmin(community);
  const c = s.community;
  const slug = c.slug;
  const info = c.info;
  const settings = c.settings ?? {};
  const features = settings.features ?? {};
  const landing = {
    tagline: info?.tagline ?? {}, welcome: info?.welcome ?? {}, address: info?.address ?? null,
    lat: info?.lat ?? null, lng: info?.lng ?? null, office_hours: info?.office_hours ?? [],
    emergency_contacts: info?.emergency_contacts ?? [], public_notices: info?.public_notices ?? [],
  };
  const brand = {
    primary: c.branding?.primary_color ?? "#0f766e", accent: c.branding?.accent_color ?? "#d97706",
    logo: c.branding?.logo_url ?? "", hero: c.branding?.hero_image_url ?? "",
  };

  return (
    <>
      <PageHeader title="Community profile"
        intro={<>Your public <a href="#landing">landing page</a>, your <a href="#branding">colours</a> and <a href="#settings">how the community works</a>.</>} />

      <div className="flex flex-col gap-6">
        <div id="landing" className="scroll-mt-24"><Card>
          {saved === "landing" && <div className="mb-5"><Notice tone="ok">{SAVED.landing}</Notice></div>}
          {/* Keyed on the saved data: after a save the form starts again from what was stored
              (notices sorted, empty rows dropped); after an error it keeps what was typed. */}
          <PublicInfoForm key={JSON.stringify([landing, c.enabled_languages, c.default_language])} action={savePublicInfo.bind(null, slug)}
            landingHref={`/${slug}`} today={dayInput(c.timezone)}
            languages={c.enabled_languages} defaultLanguage={c.default_language} info={landing} />
        </Card></div>

        <div id="branding" className="scroll-mt-24"><Card>
          {saved === "branding" && <div className="mb-5"><Notice tone="ok">{SAVED.branding}</Notice></div>}
          <BrandingForm key={JSON.stringify(brand)} action={saveBranding.bind(null, slug)} communityName={c.name} initial={brand} />
        </Card></div>

        <div id="settings" className="scroll-mt-24"><Card>
          {saved === "settings" && <div className="mb-5"><Notice tone="ok">{SAVED.settings}</Notice></div>}
          <SectionHeader icon={Settings2} title="Settings" description="How the community works" />
          <ActionForm action={saveSettings.bind(null, slug)} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="name">Community name</label>
                <input id="name" name="name" className="input" required minLength={2} maxLength={80} defaultValue={c.name} />
              </div>
              <div className="field">
                <label htmlFor="default_language">Main language</label>
                <select id="default_language" name="default_language" className="input" defaultValue={c.default_language}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <fieldset className="min-w-0">
              <legend className="label mb-2">Languages offered</legend>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <label key={l.code} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border border-line px-3.5 hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="checkbox" name="languages" value={l.code} defaultChecked={c.enabled_languages.includes(l.code)} className="size-4 accent-[var(--brand)]" />
                    <span className="text-[0.9375rem] text-ink">{l.label}</span>
                  </label>
                ))}
              </div>
              <p className="hint mt-2">Residents can pick any of these. The main language must be one of them.</p>
            </fieldset>

            <div className="divide-y divide-line border-y border-line">
              <Toggle name="tenant_requires_approval" defaultChecked={!!settings.tenant_requires_approval}
                title="Approve new tenants" text="When a landlord adds a tenant, they wait for your approval before they can sign in." />
              <Toggle name="feature_ai" defaultChecked={features.ai !== false}
                title="Assistant" text="Residents can ask questions by typing or speaking." />
              <Toggle name="feature_whatsapp" defaultChecked={!!features.whatsapp}
                title="WhatsApp" text="Residents can ask the assistant and get reminders on WhatsApp." />
              <Toggle name="feature_meetings" defaultChecked={features.meetings !== false}
                title="Meetings" text="Announce meetings, collect replies and share minutes." />
            </div>

            <div className="field sm:max-w-xs">
              <label htmlFor="invoice_threshold">Invoices needing two approvals</label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
                <input id="invoice_threshold" name="invoice_threshold" inputMode="decimal" className="input tabular pl-8" required
                  defaultValue={centsToInput(settings.invoice_approval_threshold_cents ?? 100000)} aria-describedby="invoice_threshold_hint" />
              </div>
              <p id="invoice_threshold_hint" className="hint">Invoices above this amount need a second person to approve them.</p>
            </div>

            <div className="flex justify-end border-t border-line pt-6">
              <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save settings</SubmitButton>
            </div>
          </ActionForm>
        </Card></div>
      </div>
    </>
  );
}
