import { cookies } from "next/headers";
import { Bell, Mail, Mailbox, MessageCircle, Phone, ShieldCheck, Smartphone, Type, UserRound } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice, PageHeader, SectionHeader } from "@/components/ui";
import { ActionForm } from "@/components/me/forms";
import { ChoiceCard, FieldGroup } from "@/components/me/fields";
import DisplayFields from "./DisplayFields";
import { CHANNELS, METHODS, SCALES, VISIBILITIES } from "./options";
import { saveDetails, saveDisplay, saveNotify, saveSharing } from "./actions";

export const metadata = { title: "Settings" };

const METHOD_ICONS = { phone: Phone, whatsapp: MessageCircle, email: Mail, letter: Mailbox };
const CHANNEL_ICONS = { push: Bell, email: Mail, whatsapp: Smartphone };

export default async function SettingsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const slug = s.community.slug;

  const [{ data: profile }, { data: sharing }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("id", s.userId).single(),
    supabase.from("contact_preferences").select("preferred_method, best_times, visibility")
      .eq("profile_id", s.userId).eq("community_id", s.community.id).maybeSingle(),
  ]);

  const prefs = {
    font_scale: s.prefs?.font_scale ?? 100,
    theme: s.prefs?.theme ?? "light",
    high_contrast: s.prefs?.high_contrast ?? false,
    dyslexia_font: s.prefs?.dyslexia_font ?? false,
    reduce_motion: s.prefs?.reduce_motion ?? false,
    language: s.prefs?.language ?? s.community.default_language,
  };
  // The page is drawn at the size in the a11y_fs cookie (normally the saved one), so the live preview scales from that.
  const cookieScale = Number((await cookies()).get("a11y_fs")?.value);
  const drawnScale = SCALES.includes(cookieScale) ? cookieScale : prefs.font_scale;
  const channel = s.prefs?.notify_channel ?? "email";
  const email = profile?.email ?? s.email;
  const phone = profile?.phone ?? null;
  const visibility = sharing?.visibility ?? "block";
  const method = sharing?.preferred_method ?? "email";

  const channelText: Record<string, string> = {
    push: "Under the bell at the top, and on your phone if you add the app to your home screen.",
    email: `To ${email}.`,
    whatsapp: phone ? `To ${phone}.` : "Add your phone number above first.",
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Settings" intro="Make the app easier to read, and choose how neighbours and the office can reach you." />

      <Card>
        <div id="display" className="scroll-mt-24" />
        <SectionHeader icon={Type} title="Reading and display" description="Changes apply to every page, on this device and when you sign in elsewhere." />
        <ActionForm action={saveDisplay.bind(null, slug)} submitLabel="Save display settings">
          <DisplayFields prefs={prefs} languages={s.community.enabled_languages} currentScale={drawnScale} />
        </ActionForm>
      </Card>

      <Card>
        <div id="details" className="scroll-mt-24" />
        <SectionHeader icon={UserRound} title="Your details" description="Shown to the office, and to neighbours if you share them below." />
        <ActionForm action={saveDetails.bind(null, slug)} submitLabel="Save details">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input id="full_name" name="full_name" required minLength={2} maxLength={80} autoComplete="name" className="input" defaultValue={profile?.full_name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={24} className="input" placeholder="+34 600 123 456" defaultValue={phone ?? ""} />
            </div>
          </div>
          <div className="field">
            <span className="label">Email</span>
            <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-ink-2 ring-1 ring-inset ring-line [overflow-wrap:anywhere]">{email}</p>
            <p className="hint">This is how you sign in. To change it, ask the office.</p>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <div id="sharing" className="scroll-mt-24" />
        <SectionHeader icon={ShieldCheck} title="Contact sharing" description="How you like to be contacted, and who can see your phone and email." />
        <ActionForm action={saveSharing.bind(null, slug)} submitLabel="Save sharing">
          <FieldGroup legend="Best way to reach me">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
              {METHODS.map((m) => (
                <ChoiceCard key={m.value} name="preferred_method" value={m.value} label={m.label} icon={METHOD_ICONS[m.value]} defaultChecked={method === m.value} />
              ))}
            </div>
          </FieldGroup>
          <div className="field">
            <label htmlFor="best_times">Best times <span className="font-normal text-muted">· optional</span></label>
            <input id="best_times" name="best_times" maxLength={80} className="input" placeholder="e.g. Weekdays 9:00 – 18:00" defaultValue={sharing?.best_times ?? ""} />
          </div>
          <FieldGroup legend="Who can see my phone and email">
            <div className="flex flex-col gap-2">
              {VISIBILITIES.map((v) => (
                <ChoiceCard key={v.value} name="visibility" value={v.value} label={v.label} description={v.description} defaultChecked={visibility === v.value} />
              ))}
            </div>
          </FieldGroup>
          <Notice tone="info">Administrators can always see your contact details, so they can reach you in an emergency such as a leak.</Notice>
        </ActionForm>
      </Card>

      <Card>
        <div id="notifications" className="scroll-mt-24" />
        <SectionHeader icon={Bell} title="Notifications" description="Where we send meeting alerts, replies to your reports and reminders." />
        <ActionForm action={saveNotify.bind(null, slug)} submitLabel="Save notifications" footerNote="Alerts always appear under the bell as well.">
          <FieldGroup legend="Send my alerts">
            <div className="flex flex-col gap-2">
              {CHANNELS.map((c) => (
                <ChoiceCard key={c.value} name="notify_channel" value={c.value} label={c.label} icon={CHANNEL_ICONS[c.value]}
                  description={channelText[c.value]} defaultChecked={channel === c.value} />
              ))}
            </div>
          </FieldGroup>
        </ActionForm>
      </Card>
    </div>
  );
}
