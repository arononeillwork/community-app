import Link from "next/link";
import clsx from "clsx";
import { Building2, Clock, KeyRound, MapPin, Phone, Settings, Users } from "lucide-react";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice, PageHeader } from "@/components/ui";
import DataTable, { type Column } from "@/components/DataTable";
import PersonCard from "@/components/people/PersonCard";
import {
  METHOD_LABELS, ROLE_EXPLAINED, clean, joinList, roleLabel, sortRoles, telHref,
} from "@/components/people/contact";

export const metadata = { title: "Contacts" };

/** One row of the SQL function directory(c uuid). Private details come back as NULL. */
type DirectoryRow = {
  profile_id: string;
  full_name: string | null;
  roles: string[] | null;
  units: string[] | null;
  email: string | null;
  phone: string | null;
  preferred_method: string | null;
  best_times: string | null;
  is_my_owner: boolean | null;
};

const TABLE_ROLE_ORDER = ["owner", "tenant", "admin", "treasurer"];

const isEmergency = (label: string, phone: string) => /emergenc|112|ambulance|fire|police/i.test(label) || phone.trim() === "112";

export default async function ContactsPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);
  const supabase = await createClient();
  const base = `/${s.community.slug}`;
  const settingsHref = `${base}/settings#sharing`;

  const { data, error } = await supabase.rpc("directory", { c: s.community.id });
  const people = ((data ?? []) as DirectoryRow[]).filter((p) => p && p.profile_id);

  const me = people.find((p) => p.profile_id === s.userId);
  const myFlats = me?.units ?? [];

  // Tenants: the owner(s) of the flat they rent.
  const landlords = people.filter((p) => p.is_my_owner && p.profile_id !== s.userId);

  // Committee: administrators first, then the treasurer.
  const committee = people
    .filter((p) => (p.roles ?? []).some((r) => r === "admin" || r === "treasurer"))
    .sort((a, b) => Number((b.roles ?? []).includes("admin")) - Number((a.roles ?? []).includes("admin"))
      || (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const info = s.community.info;
  const officeHours = (Array.isArray(info?.office_hours) ? info.office_hours : []).filter((h) => h && (h.label || h.hours));
  const phones = (Array.isArray(info?.emergency_contacts) ? info.emergency_contacts : [])
    .filter((c) => c && typeof c.phone === "string" && c.phone.trim());
  const address = clean(info?.address);

  const rows = people.map((p) => {
    const roles = sortRoles(p.roles);
    // In the table, show what kind of resident someone is first; committee roles go underneath.
    const main = TABLE_ROLE_ORDER.find((r) => roles.includes(r)) ?? roles[0] ?? "";
    const others = roles.filter((r) => r !== main).map((r) => roleLabel(r).toLowerCase());
    const phone = clean(p.phone);
    const email = clean(p.email);
    const times = clean(p.best_times);
    // directory() blanks phone, email and best times together when a person keeps them private.
    const missing = phone || email || times ? "Not given" : "Private";
    return {
      id: p.profile_id,
      name: `${clean(p.full_name) ?? "Name not given"}${p.profile_id === s.userId ? " (you)" : ""}`,
      flats: p.units && p.units.length > 0 ? p.units : null,
      role: main ? roleLabel(main) : "Resident",
      role_also: others.length ? `Also ${joinList(others)}` : "",
      method: p.preferred_method ? (METHOD_LABELS[p.preferred_method] ?? p.preferred_method) : "Not set",
      best_times: times ? `Best times: ${times}` : "",
      phone: phone ?? missing,
      email: email ?? missing,
    };
  });

  const columns: Column[] = [
    { key: "name", header: "Name", primary: true },
    { key: "flats", header: "Flats", type: "tags" },
    { key: "role", header: "Role", filter: true, subKey: "role_also" },
    { key: "method", header: "Prefers", filter: true, subKey: "best_times" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Contacts"
        intro="How to reach your landlord, the community office, the committee and your neighbours."
      />

      {error && (
        <Notice tone="bad">We could not load the contact list just now. Please try again in a few minutes.</Notice>
      )}

      {/* Your landlord (tenants) */}
      {landlords.length > 0 ? (
        <section aria-labelledby="landlord-heading" className="flex flex-col gap-4">
          <h2 id="landlord-heading" className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound aria-hidden className="size-7" /> {landlords.length > 1 ? "Your landlords" : "Your landlord"}
          </h2>
          <p className="text-muted">The owner of the flat you rent. Contact them about your home, rent or repairs inside your flat.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {landlords.map((l) => {
              const flats = l.units ?? [];
              const yours = flats.filter((u) => myFlats.includes(u));
              const other = flats.filter((u) => !yours.includes(u));
              return (
                <PersonCard
                  key={l.profile_id}
                  prominent
                  name={clean(l.full_name) ?? "Your landlord"}
                  details={
                    <div className="text-lg">
                      {yours.length > 0 && <p>Owner of your flat: <strong>{joinList(yours)}</strong></p>}
                      {other.length > 0 && (
                        <p className="text-muted">{yours.length > 0 ? "Also owns" : "Flats"}: {joinList(other)}</p>
                      )}
                    </div>
                  }
                  preferred={l.preferred_method}
                  bestTimes={l.best_times}
                  phone={l.phone}
                  email={l.email}
                  settingsHref={settingsHref}
                  privateText="Your landlord keeps their phone and email private. The community office can pass on a message for you."
                />
              );
            })}
          </div>
        </section>
      ) : s.isTenant && !error ? (
        <Card>
          <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold">
            <KeyRound aria-hidden className="size-7" /> Your landlord
          </h2>
          <p>We could not find the owner of your flat in the app yet. The community office can help you contact them.</p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Community office */}
        <Card className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 aria-hidden className="size-7" /> Community office
          </h2>
          {address && (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
              <span>{address}</span>
            </p>
          )}
          {officeHours.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <Clock aria-hidden className="size-5" /> Opening hours
              </h3>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {officeHours.map((h, i) => (
                  <div key={`${h.label}-${i}`} className="contents">
                    <dt className="font-bold">{h.label}</dt>
                    <dd className="mb-2 sm:mb-0">{h.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {phones.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <Phone aria-hidden className="size-5" /> Phone numbers
              </h3>
              <p className="mb-3 text-muted">Tap a number to call it.</p>
              <ul className="flex flex-col gap-3">
                {phones.map((c, i) => {
                  const urgent = isEmergency(c.label ?? "", c.phone);
                  return (
                    <li key={`${c.label}-${c.phone}-${i}`}>
                      <a
                        href={telHref(c.phone)}
                        className={clsx(
                          "flex min-h-14 items-center gap-4 rounded-xl border-2 bg-surface px-4 py-3 text-ink no-underline",
                          urgent ? "border-bad/50 hover:border-bad" : "border-line-strong hover:border-brand",
                        )}
                      >
                        <Phone aria-hidden className={clsx("size-6 shrink-0", urgent ? "text-bad" : "text-brand")} />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-bold">{c.label || "Phone"}</span>
                          <span className={clsx("tabular text-xl font-bold", urgent && "text-bad")}>{c.phone}</span>
                        </span>
                        <span className="sr-only">: tap to call</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {officeHours.length === 0 && phones.length === 0 && !address && (
            <p className="text-muted">The office has not added its opening hours or phone numbers yet.</p>
          )}
          <p className="hint">In an emergency (danger, fire, someone hurt), call 112 first.</p>
        </Card>

        {/* Committee */}
        <section aria-labelledby="committee-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="committee-heading" className="flex items-center gap-2 text-2xl font-bold">
              <Users aria-hidden className="size-7" /> Committee
            </h2>
            <p className="text-muted">The people who run the community and look after its money.</p>
          </div>
          {committee.length === 0 ? (
            <Card><p className="text-muted">No committee members are listed yet. Please contact the community office.</p></Card>
          ) : (
            committee.map((c) => {
              const roles = sortRoles(c.roles).filter((r) => r === "admin" || r === "treasurer");
              return (
                <PersonCard
                  key={c.profile_id}
                  name={clean(c.full_name) ?? "Committee member"}
                  isYou={c.profile_id === s.userId}
                  details={
                    <ul className="flex flex-col">
                      {roles.map((r) => (
                        <li key={r}><strong>{roleLabel(r)}</strong> <span className="text-muted">– {ROLE_EXPLAINED[r]}</span></li>
                      ))}
                    </ul>
                  }
                  preferred={c.preferred_method}
                  bestTimes={c.best_times}
                  phone={c.phone}
                  email={c.email}
                  settingsHref={settingsHref}
                  privateText="Their contact details are private. Please contact the community office instead."
                />
              );
            })
          )}
        </section>
      </div>

      {/* Everyone */}
      <section aria-labelledby="everyone-heading" className="flex flex-col gap-3">
        <h2 id="everyone-heading" className="text-2xl font-bold">Everyone in {s.community.name}</h2>
        <p className="hint">
          Each person chooses what they share. Where you see “Private”, that person has not shared it with you.
          You can choose what others see about you in Settings.
        </p>
        <div className="no-print">
          <Link href={settingsHref}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-5 font-bold text-ink no-underline hover:bg-bg">
            <Settings aria-hidden className="size-5" /> Choose what I share
          </Link>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          defaultSort={{ key: "name" }}
          exportName="contacts"
          searchPlaceholder="Search by name or flat…"
          empty="No one to show."
          views={[
            { label: "Owners", params: { f_role: "Owner" } },
            { label: "Tenants", params: { f_role: "Tenant" } },
          ]}
        />
      </section>
    </div>
  );
}
