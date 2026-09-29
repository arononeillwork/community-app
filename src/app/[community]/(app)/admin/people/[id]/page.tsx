import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, RotateCcw, UserX } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { date, todayInput } from "@/lib/format";
import { Badge, Card, Notice, PageHeader, StatusBadge } from "@/components/ui";
import AdminNav from "@/components/admin/AdminNav";
import AddPersonForm from "@/components/admin/AddPersonForm";
import ActionButton from "@/components/admin/ActionButton";
import ConfirmAction from "@/components/admin/ConfirmAction";
import RoleChoiceFields from "@/components/admin/RoleChoiceFields";
import { ROLES, ROLE_HINTS, ROLE_LABELS, doneMessage, isRole, needsFlat, tenancyTypeLabel, type AdminRole } from "@/components/admin/labels";
import { addPerson, changeRole, endOwnership, endRole, endTenancy, removeFromCommunity, restoreRole } from "../actions";

export const metadata = { title: "Person" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ community: string; id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { community, id } = await params;
  const { done } = await searchParams;
  const s = await requireAdmin(community);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const cid = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}`;
  const today = todayInput(s.community.timezone);

  const [memRes, profRes, ownRes, tenRes, unitRes] = await Promise.all([
    supabase.from("memberships").select("id, role, status, created_at").eq("community_id", cid).eq("profile_id", id),
    supabase.from("profiles").select("id, full_name, email, phone").eq("id", id).maybeSingle(),
    supabase.from("unit_ownerships").select("id, start_date, end_date, unit:units(label)")
      .eq("community_id", cid).eq("owner_id", id).order("start_date", { ascending: false }),
    supabase.from("tenancies").select("id, status, tenancy_type, start_date, end_date, unit:units(label)")
      .eq("community_id", cid).eq("tenant_id", id).order("start_date", { ascending: false }),
    supabase.from("units").select("id, label").eq("community_id", cid).order("label"),
  ]);

  const memberships = (memRes.data ?? [])
    .filter((m) => isRole(m.role))
    .map((m) => ({ id: String(m.id), role: m.role as AdminRole, status: String(m.status), since: String(m.created_at ?? "") }))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const profile = profRes.data;
  if (memberships.length === 0 || !profile) notFound();

  const name = String(profile.full_name || profile.email || "This person");
  const email = profile.email ? String(profile.email) : "";
  const phone = profile.phone ? String(profile.phone) : "";
  const isSelf = id === s.userId;
  const units = (unitRes.data ?? []).map((u) => ({ id: String(u.id), label: String(u.label) }));

  const ownerships = (ownRes.data ?? []).map((o) => ({
    id: String(o.id),
    label: (o.unit as unknown as { label: string } | null)?.label ?? "?",
    start: String(o.start_date ?? ""),
    end: o.end_date ? String(o.end_date) : null,
  })).map((o) => ({ ...o, current: !o.end || o.end >= today }));
  const tenancies = (tenRes.data ?? []).map((t) => ({
    id: String(t.id),
    label: (t.unit as unknown as { label: string } | null)?.label ?? "?",
    status: String(t.status),
    type: String(t.tenancy_type ?? "other"),
    start: String(t.start_date ?? ""),
    end: t.end_date ? String(t.end_date) : null,
  }));

  const currentFlats = ownerships.filter((o) => o.current).map((o) => o.label);
  const hasAnyActive = memberships.some((m) => m.status !== "ended");

  function endQuestion(role: AdminRole) {
    if (role === "tenant") return `End ${name}'s tenant role? Their tenancy ends today and they can no longer use the app as a tenant.`;
    if (role === "owner") {
      return `End ${name}'s owner role? ${currentFlats.length ? `They will no longer be listed as owner of ${currentFlats.join(", ")}. ` : ""}This takes effect straight away.`;
    }
    return `End ${name}'s ${ROLE_LABELS[role].toLowerCase()} role? They lose these rights straight away.`;
  }

  return (
    <>
      <AdminNav slug={slug} />
      <PageHeader
        title={name}
        back={{ href: `${base}/admin/people`, label: "People & flats" }}
        intro={isSelf ? "This is you." : "Roles, flats and access for this person."}
      />
      {doneMessage(done) && <div className="mb-5"><Notice tone="ok">{doneMessage(done)}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* ---- Roles ---- */}
          <Card className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold">Roles</h2>
            <p className="text-muted">A person can have more than one role, for example owner and treasurer.</p>
            <ul className="flex flex-col gap-4">
              {memberships.map((m) => (
                <li key={m.id} className="flex flex-col gap-3 rounded-xl border-2 border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold">{ROLE_LABELS[m.role]}</h3>
                    <StatusBadge value={m.status} />
                    {m.since && <span className="text-muted">since {date(m.since)}</span>}
                  </div>
                  <p className="text-muted">{ROLE_HINTS[m.role]}</p>

                  {m.status === "active" && (
                    <div className="flex flex-col gap-4 border-t border-line pt-3">
                      <ConfirmAction
                        action={changeRole.bind(null, slug, m.id)}
                        label="Change role"
                        variant="secondary"
                        question={`Change ${name} from ${ROLE_LABELS[m.role].toLowerCase()} to the role chosen above? Their access changes straight away.`}
                        confirmLabel="Yes, change the role"
                        confirmVariant="primary"
                      >
                        <RoleChoiceFields current={m.role} units={units} idPrefix={`change-${m.id}`} />
                      </ConfirmAction>
                      <ConfirmAction
                        action={endRole.bind(null, slug, m.id)}
                        label={`End ${ROLE_LABELS[m.role].toLowerCase()} role`}
                        icon={<UserX aria-hidden className="size-5" />}
                        question={endQuestion(m.role)}
                        confirmLabel={`Yes, end the ${ROLE_LABELS[m.role].toLowerCase()} role`}
                      />
                    </div>
                  )}

                  {m.status === "pending" && (
                    <div className="flex flex-col gap-1">
                      <p>Waiting for an administrator to approve the tenancy.</p>
                      <Link href={`${base}/admin/people#pending`} className="inline-flex min-h-12 w-fit items-center font-bold text-brand underline">
                        Go to tenancies waiting for approval
                      </Link>
                    </div>
                  )}

                  {m.status === "ended" && (needsFlat(m.role) ? (
                    <p className="text-muted">
                      To make {name} {m.role === "owner" ? "an owner" : "a tenant"} again, use “Give a role or flat” and choose the flat.
                    </p>
                  ) : (
                    <ActionButton action={restoreRole.bind(null, slug, m.id)} label="Give this role back" variant="secondary"
                      icon={<RotateCcw aria-hidden className="size-5" />} />
                  ))}
                </li>
              ))}
            </ul>
          </Card>

          {/* ---- Flats ---- */}
          <Card className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold">Flats</h2>
            {ownerships.length === 0 && tenancies.length === 0 && <p className="text-muted">Not linked to any flat.</p>}

            {ownerships.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xl font-bold">Owns</h3>
                <ul className="flex flex-col gap-3">
                  {ownerships.map((o) => (
                    <li key={o.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold">Flat {o.label}</span>
                        <Badge tone={o.current ? "ok" : "neutral"}>{o.current ? "Current" : "Ended"}</Badge>
                      </div>
                      <p className="text-muted">From {date(o.start)}{o.end ? ` until ${date(o.end)}` : ""}</p>
                      {o.current && (
                        <ConfirmAction
                          action={endOwnership.bind(null, slug, o.id)}
                          label="End this ownership"
                          question={`End ${name}'s ownership of flat ${o.label}, for example because it was sold? They stay a member; use “Remove from the community” to remove them completely.`}
                          confirmLabel="Yes, end the ownership"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tenancies.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xl font-bold">Rents</h3>
                <ul className="flex flex-col gap-3">
                  {tenancies.map((t) => (
                    <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold">Flat {t.label}</span>
                        <StatusBadge value={t.status} />
                      </div>
                      <p className="text-muted">{tenancyTypeLabel(t.type)} · from {date(t.start)} · {t.end ? `until ${date(t.end)}` : "no end date"}</p>
                      {t.status === "active" && (
                        <ConfirmAction
                          action={endTenancy.bind(null, slug, t.id)}
                          label="End this tenancy now"
                          question={`End ${name}'s tenancy of flat ${t.label} today? If it is their only tenancy, they can no longer use the app as a tenant.`}
                          confirmLabel="Yes, end the tenancy"
                        />
                      )}
                      {t.status === "pending" && (
                        <Link href={`${base}/admin/people#pending`} className="inline-flex min-h-12 w-fit items-center font-bold text-brand underline">Approve or decline this tenancy</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ---- Give a role or flat ---- */}
          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold">Give a role or flat</h2>
              <p className="text-muted">For example, make an owner the treasurer too, or add a second flat they own.</p>
            </div>
            <AddPersonForm action={addPerson.bind(null, slug)} units={units} today={today} identity={{ email, name }} idPrefix="give" />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold">Contact</h2>
            {email ? (
              <a href={`mailto:${email}`} className="flex min-h-12 items-center gap-2 break-all font-bold text-brand underline">
                <Mail aria-hidden className="size-5 shrink-0" /> {email}
              </a>
            ) : <p className="text-muted">No email address.</p>}
            {phone ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex min-h-12 items-center gap-2 font-bold text-brand underline">
                <Phone aria-hidden className="size-5 shrink-0" /> {phone}
              </a>
            ) : <p className="text-muted">No phone number.</p>}
          </Card>

          {!isSelf && hasAnyActive && (
            <Card className="flex flex-col gap-3 !border-bad/40">
              <h2 className="text-2xl font-bold">Remove from the community</h2>
              <p className="text-muted">
                Ends every role, tenancy and ownership. {name} can no longer sign in here. Their reports and history are kept.
              </p>
              <ConfirmAction
                action={removeFromCommunity.bind(null, slug, id)}
                label="Remove from the community"
                icon={<UserX aria-hidden className="size-5" />}
                question={`Remove ${name} from ${s.community.name}? This ends all their roles, tenancies and ownerships straight away.`}
                confirmLabel={`Yes, remove ${name}`}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
