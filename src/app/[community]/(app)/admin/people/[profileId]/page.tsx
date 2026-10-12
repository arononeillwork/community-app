import Link from "next/link";
import { notFound } from "next/navigation";
import { Contact, Eye, Home, KeyRound, Plus, ShieldCheck, UserCog, X } from "lucide-react";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { date } from "@/lib/format";
import { Badge, Card, DefinitionList, IconButton, Notice, PageHeader, SectionHeader, buttonClass } from "@/components/ui";
import { ContactActions, PhoneText } from "@/components/contact";
import SubmitButton from "@/components/admin/SubmitButton";
import LinkFlatForm from "@/components/admin/LinkFlatForm";
import { METHOD_LABELS, ROLE_LABELS, ROLE_ORDER, TENANCY_TYPES, VISIBILITY_LABELS, ago, byLabel, dayIn, dayInput } from "@/components/admin/format";
import { UUID } from "../occupancy";
import { flatsByBlock } from "../flats";
import {
  addRole, approveTenancy, deactivatePerson, declineTenancy, endOwnership, endTenancy, linkFlat, removeRole, resendInvite,
} from "../actions";

export const metadata = { title: "Person" };

type Flat = { id: string; label: string; building: { name: string } | null };
type Ownership = { id: string; start_date: string; end_date: string | null; unit: Flat | null };
type Tenancy = { id: string; status: string; tenancy_type: string; start_date: string; end_date: string | null; note: string | null; unit: Flat | null; added: { full_name: string } | null };

const MESSAGES: Record<string, { tone: "ok" | "info" | "bad"; title?: string; text: string }> = {
  invited: { tone: "ok", title: "Invite sent", text: "They will get an email with a link to sign in." },
  added: { tone: "ok", title: "Added", text: "They already had an account, so no email was sent. They can sign in with their usual details." },
  resent: { tone: "ok", text: "A new invite email is on its way." },
  "saved=role": { tone: "ok", text: "Roles updated." },
  "saved=flat": { tone: "ok", text: "Flat linked." },
  "saved=ownership_ended": { tone: "info", text: "Ownership ended. If they no longer own a flat here, remove their owner role under Roles." },
  "saved=tenancy_ended": { tone: "info", text: "Tenancy ended. Their tenant access has stopped." },
  approved: { tone: "ok", text: "Tenancy approved. They can now sign in." },
  declined: { tone: "info", text: "Tenancy declined." },
  deactivated: { tone: "info", title: "Deactivated", text: "They can no longer sign in. Their flats and history stay on record." },
  "error=own_admin": { tone: "bad", text: "You can't remove your own administrator role. Ask another administrator to do it." },
  "error=last_admin": { tone: "bad", text: "The community needs at least one administrator. Add another administrator first." },
  "error=only_role": { tone: "bad", text: "This is their only role. To remove their access, deactivate them instead." },
  "error=still_owner": { tone: "bad", text: "They still own a flat. End the ownership below first." },
  "error=self": { tone: "bad", text: "You can't deactivate yourself." },
  "error=already_joined": { tone: "info", text: "They have already accepted their invite. They can use “Email me a sign-in link” on the sign-in page." },
  "error=invite_failed": { tone: "bad", text: "The invite could not be sent. Please try again in a few minutes." },
  "error=role": { tone: "bad", text: "That role could not be changed. Please try again." },
  "error=flat": { tone: "bad", text: "That flat could not be updated. Please try again." },
  "error=tenancy": { tone: "bad", text: "That tenancy could not be updated. It may already have been decided." },
  "error=deactivate": { tone: "bad", text: "They could not be deactivated. Please try again." },
};

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ community: string; profileId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { community, profileId } = await params;
  const sp = await searchParams;
  const s = await requireAdmin(community);
  if (!UUID.test(profileId)) notFound();
  const supabase = await createClient();
  const c = s.community.id;
  const slug = s.community.slug;
  const base = `/${slug}`;
  const today = dayInput(s.community.timezone);

  // RLS: administrators read the memberships and profiles of their own community only.
  const { data: memberships } = await supabase.from("memberships").select("role, status, created_at")
    .eq("community_id", c).eq("profile_id", profileId);
  if (!memberships?.length) notFound();

  const [{ data: profile }, { data: owns }, { data: tens }, { data: prefs }, { data: keyRoles }, blocks] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("id", profileId).single(),
    supabase.from("unit_ownerships").select("id, start_date, end_date, unit:units(id, label, building:buildings(name))")
      .eq("community_id", c).eq("owner_id", profileId).or(`end_date.is.null,end_date.gte.${today}`),
    supabase.from("tenancies").select("id, status, tenancy_type, start_date, end_date, note, unit:units(id, label, building:buildings(name)), added:profiles!tenancies_added_by_fkey(full_name)")
      .eq("community_id", c).eq("tenant_id", profileId).in("status", ["active", "pending"]).order("start_date"),
    supabase.from("contact_preferences").select("preferred_method, best_times, visibility").eq("community_id", c).eq("profile_id", profileId).maybeSingle(),
    supabase.from("key_contacts").select("role_title").eq("community_id", c).eq("profile_id", profileId).order("sort"),
    flatsByBlock(c),
  ]);
  if (!profile) notFound();

  // Sign-in status comes from the auth service (service role, administrators only, member of this community).
  const { data: auth } = await createAdminClient().auth.admin.getUserById(profileId);
  const account = auth?.user ?? null;

  const active = memberships.filter((m) => m.status === "active").map((m) => m.role as string);
  const pendingRoles = memberships.filter((m) => m.status === "pending").map((m) => m.role as string);
  const status = active.length ? "active" : pendingRoles.length ? "pending" : "ended";
  const since = memberships.map((m) => m.created_at as string).sort()[0];
  const ownerships = ((owns ?? []) as unknown as Ownership[]).sort((a, b) => byLabel(a.unit?.label ?? "", b.unit?.label ?? ""));
  const tenancies = (tens ?? []) as unknown as Tenancy[];
  const isMe = profileId === s.userId;
  const confirm = sp.confirm ?? "";
  const activeTenancies = tenancies.filter((t) => t.status === "active");
  const typeLabel = (v: string) => TENANCY_TYPES.find((x) => x.value === v)?.label ?? v;
  const name = profile.full_name || profile.email || "Unnamed";
  const prefersWhatsapp = prefs?.preferred_method === "whatsapp";

  const msgKey = ["invited", "added", "resent", "approved", "declined", "deactivated"].find((k) => sp[k])
    ?? (sp.saved ? `saved=${sp.saved}` : sp.error ? `error=${sp.error}` : null);
  const msg = msgKey ? MESSAGES[msgKey] : null;

  const signIn = account?.last_sign_in_at
    ? `Last signed in ${ago(account.last_sign_in_at)}`
    : account?.email_confirmed_at
      ? "Has an account, hasn't signed in yet"
      : account?.invited_at
        ? `Invited ${ago(account.invited_at)}, hasn't accepted yet`
        : "No sign-in yet";
  const canResend = !!account && !account.email_confirmed_at;
  const addable = (["treasurer", "owner", "admin"] as const).filter((r) => !active.includes(r));
  // The owner role follows their flats: it can only be removed once no ownership is left.
  const ownsFlats = ownerships.length > 0;

  const personHref = (q: string) => `${base}/admin/people/${profileId}${q ? `?${q}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={name} back={{ href: `${base}/admin/people`, label: "People" }}
        intro={<span className="flex flex-wrap items-center gap-1.5">
          {ROLE_ORDER.filter((r) => active.includes(r)).map((r) => <Badge key={r} tone="brand" dot={false}>{ROLE_LABELS[r]}</Badge>)}
          {status === "pending" && <Badge tone="warn">Waiting for approval</Badge>}
          {status === "ended" && <Badge tone="neutral">Deactivated</Badge>}
        </span>} />

      <div className="flex flex-col gap-5">
        {msg && <Notice tone={msg.tone} title={msg.title}>{msg.text}</Notice>}

        <div className="grid gap-5 lg:grid-cols-5">
          <div className="flex flex-col gap-5 lg:col-span-3">
            {/* Contact details */}
            <Card>
              <SectionHeader icon={Contact} title="Contact details" />
              <DefinitionList items={[
                { label: "Email", value: profile.email ? <a href={`mailto:${profile.email}`} className="break-all">{profile.email}</a> : <span className="text-muted">Not given</span> },
                { label: "Phone", value: profile.phone ? <PhoneText phone={profile.phone} /> : <span className="text-muted">Not given</span> },
                { label: "Flats", value: [...ownerships.map((o) => o.unit?.label), ...tenancies.map((t) => t.status === "pending" ? `${t.unit?.label} (waiting for approval)` : t.unit?.label)]
                  .filter(Boolean).join(", ") || <span className="text-muted">None</span> },
                ...(keyRoles?.length ? [{ label: "Key contact", value: keyRoles.map((k) => k.role_title).join(", ") }] : []),
                { label: "Member since", value: dayIn(since, s.community.timezone) },
              ]} />
              <ContactActions name={name} phone={profile.phone} whatsapp={prefersWhatsapp ? profile.phone : null} email={profile.email}
                variant="buttons" className="mt-5" />
            </Card>

            {/* Flats */}
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                <SectionHeader icon={Home} title="Flats" description="Owned or rented in this community" />
              </div>
              {ownerships.length + tenancies.length > 0 ? (
                <ul className="divide-y divide-line border-t border-line">
                  {ownerships.map((o) => (
                    <li key={o.id} className="px-5 py-3.5 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`${base}/members/flat/${o.unit?.id}`} className="font-medium no-underline hover:underline">Flat {o.unit?.label}</Link>
                          <div className="text-sm text-muted">{o.unit?.building?.name} · Owner since {date(o.start_date)}</div>
                        </div>
                        <Badge tone="info" dot={false}>Owner</Badge>
                        {confirm !== `own:${o.id}` && (
                          <Link href={personHref(`confirm=own:${o.id}`)} scroll={false} className={buttonClass("ghost", "sm")}
                            aria-label={`End ownership of flat ${o.unit?.label}`}>End</Link>
                        )}
                      </div>
                      {confirm === `own:${o.id}` && (
                        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-bad-soft p-4 sm:flex-row sm:items-center">
                          <p className="flex-1 text-[0.9375rem] text-ink">End {name.split(" ")[0]}&apos;s ownership of flat {o.unit?.label}? Use this when a flat has been sold.</p>
                          <div className="flex shrink-0 gap-2">
                            <form action={endOwnership.bind(null, slug, o.id)}><SubmitButton variant="danger" size="sm" pendingLabel="Ending…">End ownership</SubmitButton></form>
                            <Link href={personHref("")} scroll={false} className={buttonClass("secondary", "sm")}>Cancel</Link>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                  {tenancies.map((t) => (
                    <li key={t.id} className="px-5 py-3.5 sm:px-6">
                      <div className={t.status === "pending" ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3"}>
                        <div className="min-w-0 flex-1">
                          <Link href={`${base}/members/flat/${t.unit?.id}`} className="font-medium no-underline hover:underline">Flat {t.unit?.label}</Link>
                          <div className="text-sm text-muted">
                            {typeLabel(t.tenancy_type)} · {date(t.start_date)}{t.end_date ? ` to ${date(t.end_date)}` : ", no end date"}
                            {t.added?.full_name ? ` · added by ${t.added.full_name}` : ""}
                          </div>
                          {t.note && <div className="text-sm text-muted">{t.note}</div>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={t.status === "pending" ? "warn" : "ok"}>{t.status === "pending" ? "Waiting for approval" : "Tenant"}</Badge>
                        {t.status === "pending" ? (
                          <div className="flex gap-2">
                            <form action={approveTenancy.bind(null, slug, t.id)}><input type="hidden" name="from" value="person" /><SubmitButton size="sm" pendingLabel="Approving…">Approve</SubmitButton></form>
                            <form action={declineTenancy.bind(null, slug, t.id)}><input type="hidden" name="from" value="person" /><SubmitButton size="sm" variant="secondary" pendingLabel="Declining…">Decline</SubmitButton></form>
                          </div>
                        ) : confirm !== `ten:${t.id}` && (
                          <Link href={personHref(`confirm=ten:${t.id}`)} scroll={false} className={buttonClass("ghost", "sm")}
                            aria-label={`End tenancy of flat ${t.unit?.label}`}>End</Link>
                        )}
                        </div>
                      </div>
                      {confirm === `ten:${t.id}` && (
                        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-bad-soft p-4 sm:flex-row sm:items-center">
                          <p className="flex-1 text-[0.9375rem] text-ink">End this tenancy today? {name.split(" ")[0]} will lose tenant access to flat {t.unit?.label}.</p>
                          <div className="flex shrink-0 gap-2">
                            <form action={endTenancy.bind(null, slug, t.id)}><SubmitButton variant="danger" size="sm" pendingLabel="Ending…">End tenancy</SubmitButton></form>
                            <Link href={personHref("")} scroll={false} className={buttonClass("secondary", "sm")}>Cancel</Link>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-line px-5 py-4 text-[0.9375rem] text-muted sm:px-6">Not linked to a flat.</p>
              )}
              <details className="group border-t border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-[0.9375rem] font-medium text-brand-text sm:px-6 [&::-webkit-details-marker]:hidden">
                  <Plus aria-hidden className="size-4 transition-transform group-open:rotate-45" /> Link to a flat
                </summary>
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <LinkFlatForm action={linkFlat.bind(null, slug, profileId)} blocks={blocks} today={today} />
                </div>
              </details>
            </Card>
          </div>

          <div className="flex flex-col gap-5 lg:col-span-2">
            {/* Roles */}
            <Card>
              <SectionHeader icon={ShieldCheck} title="Roles" />
              <ul className="flex flex-col gap-2">
                {ROLE_ORDER.filter((r) => active.includes(r) || pendingRoles.includes(r)).map((r) => (
                  <li key={r} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-2 pl-4 pr-1">
                    <span className="text-[0.9375rem] text-ink">
                      {ROLE_LABELS[r]}
                      {r === "tenant" && <span className="text-muted"> · {pendingRoles.includes(r) ? "waiting for approval" : "from their tenancy"}</span>}
                      {r === "owner" && ownsFlats && <span className="text-muted"> · from their {ownerships.length === 1 ? "flat" : "flats"}</span>}
                      {r === "admin" && isMe && <span className="text-muted"> · you</span>}
                    </span>
                    {r !== "tenant" && active.includes(r) && !(r === "admin" && isMe) && !(r === "owner" && ownsFlats) && (
                      <form action={removeRole.bind(null, slug, profileId, r)}>
                        <IconButton type="submit" icon={X} label={`Remove the ${ROLE_LABELS[r].toLowerCase()} role`} />
                      </form>
                    )}
                  </li>
                ))}
                {!active.length && !pendingRoles.length && <li className="text-[0.9375rem] text-muted">No active roles.</li>}
              </ul>
              {addable.length > 0 && (
                <form action={addRole.bind(null, slug, profileId)} className="mt-4 flex items-end gap-2">
                  <div className="field flex-1">
                    <label htmlFor="add-role" className="!text-sm !text-muted">Add a role</label>
                    <select id="add-role" name="role" className="input" required defaultValue="">
                      <option value="" disabled>Choose a role</option>
                      {addable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <SubmitButton variant="secondary" pendingLabel="Adding…">Add</SubmitButton>
                </form>
              )}
            </Card>

            {/* Contact sharing (residents choose this themselves) */}
            <Card>
              <SectionHeader icon={Eye} title="Contact sharing" description="Chosen by them in their settings" />
              <DefinitionList items={[
                { label: "Shared with", value: VISIBILITY_LABELS[prefs?.visibility ?? "block"] + (prefs ? "" : " (default)") },
                { label: "Prefers", value: prefs?.preferred_method ? METHOD_LABELS[prefs.preferred_method] : <span className="text-muted">Not set</span> },
                { label: "Best times", value: prefs?.best_times || <span className="text-muted">Not set</span> },
              ]} />
              <p className="hint mt-4">Administrators always see everyone&apos;s details, so you can reach people in an emergency.</p>
            </Card>

            {/* Account */}
            <Card>
              <div id="account" className="scroll-mt-24" />
              <SectionHeader icon={UserCog} title="Account" />
              <div className="flex items-start gap-3 text-[0.9375rem]">
                <KeyRound aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
                <span className="text-ink-2">{signIn}</span>
              </div>
              {canResend && (
                <form action={resendInvite.bind(null, slug, profileId)} className="mt-4">
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Sending…">Resend invite</SubmitButton>
                </form>
              )}

              <div className="mt-5 border-t border-line pt-5">
                {status === "ended" ? (
                  <p className="text-[0.9375rem] text-muted">Deactivated. Add a role above to give them access again.</p>
                ) : isMe ? (
                  <p className="text-[0.9375rem] text-muted">This is you. Another administrator can deactivate your account.</p>
                ) : confirm === "deactivate" ? (
                  <form action={deactivatePerson.bind(null, slug, profileId)} className="flex flex-col gap-3 rounded-xl bg-bad-soft p-4">
                    <p className="text-[0.9375rem] text-ink">Deactivate {name}? They won&apos;t be able to sign in. Their flats and history stay on record.</p>
                    {activeTenancies.length > 0 && (
                      <label className="flex cursor-pointer items-start gap-3 text-[0.9375rem] text-ink">
                        <input type="checkbox" name="end_tenancies" defaultChecked className="mt-1 size-5 accent-[var(--bad)]" />
                        Also end their tenancy of {activeTenancies.map((t) => `flat ${t.unit?.label}`).join(" and ")} today
                      </label>
                    )}
                    <div className="flex gap-2">
                      <SubmitButton variant="danger" size="sm" pendingLabel="Deactivating…">Yes, deactivate</SubmitButton>
                      <Link href={personHref("")} scroll={false} className={buttonClass("secondary", "sm")}>Cancel</Link>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-[0.9375rem] text-muted">Moved away or no longer involved?</p>
                    <Link href={personHref("confirm=deactivate")} scroll={false} className={buttonClass("secondary", "sm", "!text-bad")}>Deactivate</Link>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
