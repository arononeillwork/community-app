import clsx from "clsx";
import { Briefcase, Clock, ConciergeBell, Siren, Users, Wrench, Pencil, type LucideIcon } from "lucide-react";
import { Avatar, Badge, IconButton } from "@/components/ui";
import { ContactActions } from "@/components/contact";

export type ContactGroup = "committee" | "management" | "staff" | "services" | "emergency";
export type ContactVisibility = "all" | "owners" | "admins";

export type KeyContact = {
  id: string;
  role_title: string;
  contact_group: ContactGroup;
  building_id: string | null;
  profile_id: string | null;
  name: string | null;
  organisation: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
  notes: string | null;
  visibility: ContactVisibility;
  sort: number;
};

export const KEY_CONTACT_COLUMNS =
  "id, role_title, contact_group, building_id, profile_id, name, organisation, phone, whatsapp, email, hours, notes, visibility, sort";

/** Friendly names for the groups, as used in the form. */
export const GROUP_LABELS: Record<ContactGroup, string> = {
  committee: "Committee",
  management: "Management",
  staff: "On-site staff",
  services: "Services and suppliers",
  emergency: "Emergency",
};

export const GROUP_ICONS: Record<ContactGroup, LucideIcon> = {
  committee: Users, management: Briefcase, staff: ConciergeBell, services: Wrench, emergency: Siren,
};

export const VISIBILITY_LABELS: Record<ContactVisibility, string> = {
  all: "Everyone", owners: "Owners only", admins: "Admins only",
};

/** A key contact as a list row: who, their role, hours, a one-line note and call / WhatsApp / email. */
export function KeyContactLine({ k, editHref, showVisibility = true, compact = false, stacked = false, className }: {
  k: KeyContact; editHref?: string; showVisibility?: boolean; compact?: boolean;
  /** Keep the actions under the text at every width (for narrow side columns). */
  stacked?: boolean; className?: string;
}) {
  const Icon = GROUP_ICONS[k.contact_group];
  const who = k.name ?? k.organisation ?? k.role_title;
  return (
    <li className={clsx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2", stacked ? "items-start" : "items-start sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center", className)}>
      {k.name ? (
        <Avatar name={k.name} />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted ring-1 ring-inset ring-line">
          <Icon aria-hidden className="size-[1.15rem]" />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>{k.role_title}</span>
          {showVisibility && k.visibility !== "all" && <Badge tone={k.visibility === "admins" ? "warn" : "neutral"} dot={false}>{VISIBILITY_LABELS[k.visibility]}</Badge>}
        </div>
        <div className="font-medium leading-snug text-ink">
          {who}
          {/* Organisation: its own line in narrow layouts, after a dot on wide rows. */}
          {k.name && k.organisation && (
            <span className={clsx("block text-[0.9375rem] font-normal text-muted", !stacked && "sm:inline sm:text-base")}>
              <span aria-hidden className={clsx("hidden", !stacked && "sm:inline")}> · </span>
              <span className="sr-only">, </span>{k.organisation}
            </span>
          )}
        </div>
        {!compact && k.hours && (
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <Clock aria-hidden className="size-3.5 shrink-0" /> {k.hours}
          </div>
        )}
        {!compact && k.notes && <p className={clsx("mt-0.5 line-clamp-2 text-sm text-muted", !stacked && "sm:line-clamp-1")} title={k.notes}>{k.notes}</p>}
      </div>
      {(k.phone || k.whatsapp || k.email || editHref) && (
        <div className={clsx("col-start-2 flex items-center gap-1", !stacked && "sm:col-start-auto")}>
          <ContactActions name={who} phone={k.phone} whatsapp={k.whatsapp} email={k.email} />
          {editHref && <IconButton icon={Pencil} label={`Edit ${k.role_title}`} href={editHref} />}
        </div>
      )}
    </li>
  );
}
