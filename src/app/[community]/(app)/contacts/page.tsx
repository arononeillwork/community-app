import clsx from "clsx";
import { Building2, Contact, Pencil, Phone, Plus, Siren } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, Empty, IconButton, Notice, PageHeader, SectionHeader } from "@/components/ui";
import { ContactActions, telHref } from "@/components/contact";
import {
  GROUP_ICONS, KEY_CONTACT_COLUMNS, KeyContactLine, VISIBILITY_LABELS, type ContactGroup, type KeyContact,
} from "@/components/people/KeyContactLine";

export const metadata = { title: "Key contacts" };

const SECTIONS: { group: Exclude<ContactGroup, "emergency">; title: string; description: string }[] = [
  { group: "staff", title: "On-site help", description: "On the complex every day" },
  { group: "committee", title: "Committee", description: "Elected by the owners" },
  { group: "management", title: "Management", description: "Administration, fees and insurance" },
  { group: "services", title: "Services", description: "Repairs, pool, gardens and cleaning" },
];

export default async function ContactsPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const { community } = await params;
  const { saved, deleted } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;

  // RLS returns only what this person may see: their own block's rows, and admin-only rows for admins.
  const [{ data }, { data: buildings }] = await Promise.all([
    supabase.from("key_contacts").select(KEY_CONTACT_COLUMNS).eq("community_id", c).order("sort").order("role_title"),
    supabase.from("buildings").select("id, name, sort").eq("community_id", c).order("sort").order("name"),
  ]);
  const all = (data ?? []) as KeyContact[];
  const edit = (k: KeyContact) => (s.isAdmin ? `${base}/contacts/${k.id}/edit` : undefined);

  const emergency = all.filter((k) => k.contact_group === "emergency");
  const blockRows = all.filter((k) => k.building_id && k.contact_group !== "emergency");
  const blockNames = new Map((buildings ?? []).map((b) => [b.id as string, b.name as string]));
  const blockIds = [...new Set(blockRows.map((k) => k.building_id!))]
    .sort((a, b) => (buildings ?? []).findIndex((x) => x.id === a) - (buildings ?? []).findIndex((x) => x.id === b));

  const sections = SECTIONS.map((sec) => ({ ...sec, rows: all.filter((k) => k.contact_group === sec.group && !k.building_id) }));
  // "Your block" sits right after on-site help, titled with the block's name.
  const blockSection = blockRows.length > 0 && {
    title: s.isAdmin || blockIds.length > 1 ? (s.isAdmin ? "Blocks" : "Your blocks") : blockNames.get(blockIds[0]) ?? "Your block",
    description: s.isAdmin ? "Each block’s representative" : blockIds.length > 1 ? "The blocks you live or own in" : "Your block",
    rows: blockIds.flatMap((id) => blockRows.filter((k) => k.building_id === id)),
  };

  const list = (title: string, description: string, Icon: typeof Contact, rows: KeyContact[]) => (
    <Card padded={false} key={title}>
      <div className="p-5 pb-1 sm:p-6 sm:pb-1">
        <SectionHeader icon={Icon} title={title} description={description} />
      </div>
      <ul className="divide-y divide-line">
        {rows.map((k) => <KeyContactLine key={k.id} k={k} editHref={edit(k)} className="px-5 py-3.5 sm:px-6" />)}
      </ul>
    </Card>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Key contacts"
        intro={s.isAdmin ? "Who residents call for help. Add, edit or hide contacts here." : "Who to call, from the concierge to the committee."}
        actions={s.isAdmin ? <Button href={`${base}/contacts/new`}><Plus aria-hidden className="size-4" /> Add contact</Button> : undefined}
      />

      {saved && <Notice tone="ok">Contact saved.</Notice>}
      {deleted && <Notice tone="ok">Contact deleted.</Notice>}

      {all.length === 0 ? (
        <Empty icon={Contact} title="No contacts yet"
          action={s.isAdmin ? <Button href={`${base}/contacts/new`}><Plus aria-hidden className="size-4" /> Add contact</Button> : undefined}>
          {s.isAdmin ? "Start with the concierge, the office and emergency numbers." : "The office has not added any contacts yet. In an emergency, call 112."}
        </Empty>
      ) : (
        <>
          {emergency.length > 0 && (
            <section aria-labelledby="emergency-title">
              <h2 id="emergency-title" className="mb-3 flex items-center gap-2 text-[1.0625rem] font-semibold">
                <Siren aria-hidden className="size-[1.15rem] text-bad" /> Emergencies
              </h2>
              {/* Phones: one slim row per number (label left, number right). Wider: a tile per number. */}
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                {emergency.map((k) => (
                  <li key={k.id} className="relative">
                    {k.phone ? (
                      <a href={telHref(k.phone)} aria-label={`Call ${k.organisation ?? k.name ?? k.role_title} on ${k.phone}`} title={k.notes ?? undefined}
                        className={clsx("card flex h-full min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-card border border-line bg-surface px-4 py-3 text-ink no-underline shadow-card transition-colors hover:border-bad/40 sm:flex-col sm:flex-nowrap sm:items-start sm:justify-center sm:gap-1 sm:py-3.5",
                          s.isAdmin && "pr-12 sm:pr-4")}>
                        <span className={clsx("flex min-w-0 items-center gap-2 text-[0.9375rem] text-muted sm:text-sm", s.isAdmin && "sm:pr-9")}>
                          <Phone aria-hidden className="size-3.5 shrink-0 text-bad" /> <span className="min-w-0 leading-snug">{k.role_title}</span>
                        </span>
                        <span className="tabular shrink-0 whitespace-nowrap text-[1.25rem] font-semibold leading-tight tracking-tight sm:text-[1.375rem]">{k.phone}</span>
                      </a>
                    ) : (
                      <div className="card flex h-full flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card">
                        <span className={clsx("text-sm text-muted", s.isAdmin && "pr-9")}>{k.role_title}</span>
                        <span className="font-medium">{k.organisation ?? k.name}</span>
                        <ContactActions name={k.organisation ?? k.name ?? k.role_title} whatsapp={k.whatsapp} email={k.email} />
                      </div>
                    )}
                    {s.isAdmin && (
                      <div className={clsx("absolute right-1.5", k.phone ? "top-1/2 -translate-y-1/2 sm:top-1.5 sm:translate-y-0" : "top-1.5")}>
                        <IconButton icon={Pencil} label={`Edit ${k.role_title}`} href={`${base}/contacts/${k.id}/edit`} />
                      </div>
                    )}
                    {k.visibility !== "all" && (
                      <div className="mt-1.5"><Badge tone={k.visibility === "admins" ? "warn" : "neutral"} dot={false}>{VISIBILITY_LABELS[k.visibility]}</Badge></div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sections[0].rows.length > 0 && list(sections[0].title, sections[0].description, GROUP_ICONS.staff, sections[0].rows)}
          {blockSection && list(blockSection.title, blockSection.description, Building2, blockSection.rows)}
          {sections.slice(1).map((sec) => sec.rows.length > 0 && list(sec.title, sec.description, GROUP_ICONS[sec.group], sec.rows))}
        </>
      )}
    </div>
  );
}
