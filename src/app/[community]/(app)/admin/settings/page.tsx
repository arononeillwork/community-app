import Link from "next/link";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { centsToInput, todayInput } from "@/lib/format";
import { Button, Card, PageHeader } from "@/components/ui";
import AdminNav from "@/components/admin/AdminNav";
import GeneralSettingsForm from "@/components/admin/GeneralSettingsForm";
import BrandingForm from "@/components/admin/BrandingForm";
import PublicInfoForm from "@/components/admin/PublicInfoForm";
import { LANGUAGE_CODES } from "@/components/admin/labels";
import { saveBranding, saveGeneral, savePublicInfo } from "./actions";

export const metadata = { title: "Community settings" };

const SECTIONS = [
  { key: "general", label: "General", intro: "Name, tenant approval, invoice approval limit and languages." },
  { key: "branding", label: "Colours & logo", intro: "Your community's colours and logo. Colours are checked so text stays easy to read." },
  { key: "public", label: "Public page", intro: "What anyone can see on your community's front page, before signing in." },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const DEFAULT_THRESHOLD_CENTS = 100000;

function strMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string")) as Record<string, string>;
}

function list<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export default async function SettingsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { community } = await params;
  const { section: sectionParam } = await searchParams;
  const s = await requireAdmin(community);
  const c = s.community;
  const slug = c.slug;
  const base = `/${slug}`;
  const section: SectionKey = SECTIONS.some((x) => x.key === sectionParam) ? (sectionParam as SectionKey) : "general";
  const current = SECTIONS.find((x) => x.key === section)!;

  const threshold = typeof c.settings?.invoice_approval_threshold_cents === "number"
    ? c.settings.invoice_approval_threshold_cents : DEFAULT_THRESHOLD_CENTS;
  const enabled = (c.enabled_languages ?? []).filter((l) => LANGUAGE_CODES.includes(l));
  const languages = enabled.length ? enabled : ["en"];
  const info = c.info;

  return (
    <>
      <AdminNav slug={slug} />
      <PageHeader
        title="Community settings"
        intro="Changes are saved per section and are live straight away."
        actions={<Button href={base} variant="secondary"><ExternalLink aria-hidden className="size-5" /> View public page</Button>}
      />

      <nav aria-label="Settings sections" className="no-print mb-5 flex flex-wrap gap-2">
        {SECTIONS.map((x) => {
          const on = x.key === section;
          return (
            <Link key={x.key} href={x.key === "general" ? `${base}/admin/settings` : `${base}/admin/settings?section=${x.key}`}
              aria-current={on ? "page" : undefined} scroll={false}
              className={clsx("inline-flex min-h-12 items-center rounded-full border-2 px-5 font-bold no-underline",
                on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand")}>
              {x.label}
            </Link>
          );
        })}
      </nav>

      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-bold">{current.label}</h2>
          <p className="text-muted">{current.intro}</p>
        </div>

        {section === "general" && (
          <GeneralSettingsForm
            action={saveGeneral.bind(null, slug)}
            initial={{
              name: c.name,
              tenantRequiresApproval: !!c.settings?.tenant_requires_approval,
              threshold: centsToInput(threshold),
              languages,
              defaultLanguage: languages.includes(c.default_language) ? c.default_language : languages[0],
            }}
          />
        )}

        {section === "branding" && (
          <BrandingForm
            action={saveBranding.bind(null, slug)}
            communityName={c.name}
            initial={{
              primary: c.branding?.primary_color ?? "#0f766e",
              accent: c.branding?.accent_color ?? "#d97706",
              logoUrl: c.branding?.logo_url ?? null,
            }}
          />
        )}

        {section === "public" && (
          <PublicInfoForm
            action={savePublicInfo.bind(null, slug)}
            languages={languages}
            today={todayInput(c.timezone)}
            initial={{
              tagline: strMap(info?.tagline),
              welcome: strMap(info?.welcome),
              address: info?.address ?? "",
              lat: info?.lat == null ? "" : String(info.lat),
              lng: info?.lng == null ? "" : String(info.lng),
              office_hours: list<{ label?: string; hours?: string }>(info?.office_hours)
                .map((h) => ({ label: String(h?.label ?? ""), hours: String(h?.hours ?? "") })),
              emergency_contacts: list<{ label?: string; phone?: string }>(info?.emergency_contacts)
                .map((e) => ({ label: String(e?.label ?? ""), phone: String(e?.phone ?? "") })),
              public_notices: list<{ title?: string; body?: string; date?: string }>(info?.public_notices)
                .map((n) => ({ title: String(n?.title ?? ""), body: String(n?.body ?? ""), date: String(n?.date ?? "") })),
            }}
          />
        )}
      </Card>
    </>
  );
}
