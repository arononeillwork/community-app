"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayInput } from "@/components/admin/format";
import { EMAIL, PHONE, UUID, flatLabel, grantAccess, isCommunityPerson, readOccupancy, text, type Occupancy } from "./occupancy";

export type PeopleFormState = { error?: string } | undefined;

const INVITE_ROLES = ["owner", "tenant", "treasurer", "admin"];
const EDITABLE_ROLES = ["admin", "treasurer", "owner"];

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function personPath(slug: string, profileId: string, query = "") {
  return `/${slug}/admin/people/${profileId}${query ? `?${query}` : ""}`;
}

function refresh(slug: string, profileId?: string) {
  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}/admin/people`);
  if (profileId) revalidatePath(`/${slug}/admin/people/${profileId}`);
}

// ---------------------------------------------------------------------------
// Invite someone
// ---------------------------------------------------------------------------
export async function invitePerson(slug: string, _prev: PeopleFormState, form: FormData): Promise<PeopleFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();

  const fullName = text(form, "full_name").replace(/\s+/g, " ");
  const email = text(form, "email").toLowerCase();
  const phone = text(form, "phone");
  const role = text(form, "role");

  if (fullName.length < 2 || fullName.length > 120) return { error: "Please enter their full name." };
  if (!EMAIL.test(email) || email.length > 254) return { error: "Please enter a valid email address." };
  if (phone && !PHONE.test(phone)) return { error: "Please enter the phone number with digits only, for example +34 600 123 456." };
  if (!INVITE_ROLES.includes(role)) return { error: "Please choose what they are in the community." };

  let occ: Occupancy | null = null;
  if (role === "owner" || role === "tenant") {
    const r = readOccupancy(form, role, s.community.timezone);
    if ("error" in r) return r;
    occ = r.value;
    if (!(await flatLabel(supabase, s, occ.unitId))) return { error: "Please choose a flat." };
  }

  // Service role, admins only: find an existing account by email, or send an invite.
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").ilike("email", escapeLike(email)).limit(1).maybeSingle();
  let profileId = existing?.id as string | undefined;
  let invited = false;

  if (!profileId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${siteUrl()}/${s.community.slug}/auth/callback`,
    });
    if (error || !data.user) {
      return { error: /rate|limit/i.test(error?.message ?? "")
        ? "Too many emails have been sent in a short time. Please wait a few minutes and try again."
        : "The invite could not be sent. Please check the email address and try again." };
    }
    profileId = data.user.id;
    invited = true;
    await admin.from("profiles").update({ full_name: fullName, ...(phone ? { phone } : {}) }).eq("id", profileId);
  }

  const err = await grantAccess(supabase, s, profileId, role, occ);
  if (err) {
    // Don't leave a half-created account behind.
    if (invited) await admin.auth.admin.deleteUser(profileId);
    return { error: err };
  }

  refresh(slug, profileId);
  redirect(personPath(s.community.slug, profileId, invited ? "invited=1" : "added=1"));
}

export async function resendInvite(slug: string, profileId: string) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!(await isCommunityPerson(supabase, s, profileId))) redirect(`/${s.community.slug}/admin/people`);

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(profileId);
  const user = data.user;
  if (!user?.email) redirect(personPath(s.community.slug, profileId, "error=invite_failed"));
  if (user.email_confirmed_at) redirect(personPath(s.community.slug, profileId, "error=already_joined"));

  const { error } = await admin.auth.admin.inviteUserByEmail(user.email, {
    data: { full_name: user.user_metadata?.full_name ?? "" },
    redirectTo: `${siteUrl()}/${s.community.slug}/auth/callback`,
  });
  redirect(personPath(s.community.slug, profileId, error ? "error=invite_failed" : "resent=1"));
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
async function activeAdminCount(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string) {
  const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true })
    .eq("community_id", communityId).eq("role", "admin").eq("status", "active");
  return count ?? 0;
}

export async function addRole(slug: string, profileId: string, form: FormData) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const role = text(form, "role");
  if (!EDITABLE_ROLES.includes(role) || !(await isCommunityPerson(supabase, s, profileId))) {
    redirect(personPath(s.community.slug, profileId, "error=role"));
  }
  const { error } = await supabase.from("memberships")
    .upsert({ community_id: s.community.id, profile_id: profileId, role, status: "active" }, { onConflict: "community_id,profile_id,role" });
  refresh(slug, profileId);
  redirect(personPath(s.community.slug, profileId, error ? "error=role" : "saved=role"));
}

export async function removeRole(slug: string, profileId: string, role: string) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const back = (q: string) => redirect(personPath(s.community.slug, profileId, q));
  if (!EDITABLE_ROLES.includes(role) || !(await isCommunityPerson(supabase, s, profileId))) back("error=role");

  if (role === "admin" && profileId === s.userId) back("error=own_admin");
  if (role === "admin" && (await activeAdminCount(supabase, c)) <= 1) back("error=last_admin");

  const { data: active } = await supabase.from("memberships").select("role")
    .eq("community_id", c).eq("profile_id", profileId).eq("status", "active");
  const roles = (active ?? []).map((m) => m.role as string);
  if (!roles.includes(role)) back("saved=role");
  if (roles.length === 1) back("error=only_role");

  if (role === "owner") {
    const { data: owns } = await supabase.from("unit_ownerships").select("id")
      .eq("community_id", c).eq("owner_id", profileId).or(`end_date.is.null,end_date.gte.${dayInput(s.community.timezone)}`).limit(1);
    if (owns?.length) back("error=still_owner");
  }

  const { error } = await supabase.from("memberships").update({ status: "ended" })
    .eq("community_id", c).eq("profile_id", profileId).eq("role", role);
  refresh(slug, profileId);
  back(error ? "error=role" : "saved=role");
}

// ---------------------------------------------------------------------------
// Deactivate
// ---------------------------------------------------------------------------
export async function deactivatePerson(slug: string, profileId: string, form: FormData) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const c = s.community.id;
  const back = (q: string) => redirect(personPath(s.community.slug, profileId, q));
  if (!(await isCommunityPerson(supabase, s, profileId))) redirect(`/${s.community.slug}/admin/people`);
  if (profileId === s.userId) back("error=self");

  const { data: active } = await supabase.from("memberships").select("role")
    .eq("community_id", c).eq("profile_id", profileId).eq("status", "active");
  if ((active ?? []).some((m) => m.role === "admin") && (await activeAdminCount(supabase, c)) <= 1) back("error=last_admin");

  if (form.get("end_tenancies") === "on") {
    const today = dayInput(s.community.timezone);
    const { data: tenancies } = await supabase.from("tenancies").select("id, start_date, end_date")
      .eq("community_id", c).eq("tenant_id", profileId).in("status", ["active", "pending"]);
    for (const t of tenancies ?? []) {
      const end = t.start_date > today ? t.start_date : (t.end_date && t.end_date < today ? t.end_date : today);
      await supabase.from("tenancies").update({ status: "ended", end_date: end }).eq("id", t.id).eq("community_id", c);
    }
  }

  const { error } = await supabase.from("memberships").update({ status: "ended" }).eq("community_id", c).eq("profile_id", profileId);
  refresh(slug, profileId);
  back(error ? "error=deactivate" : "deactivated=1");
}

// ---------------------------------------------------------------------------
// Flats: link, end ownership, end tenancy
// ---------------------------------------------------------------------------
export async function linkFlat(slug: string, profileId: string, _prev: PeopleFormState, form: FormData): Promise<PeopleFormState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!(await isCommunityPerson(supabase, s, profileId))) return { error: "This person is not part of the community." };
  const relation = text(form, "relation");
  if (relation !== "owner" && relation !== "tenant") return { error: "Please choose owner or tenant." };
  const r = readOccupancy(form, relation, s.community.timezone);
  if ("error" in r) return r;
  if (!(await flatLabel(supabase, s, r.value.unitId))) return { error: "Please choose a flat." };
  const err = await grantAccess(supabase, s, profileId, relation, r.value);
  if (err) return { error: err };
  refresh(slug, profileId);
  redirect(personPath(s.community.slug, profileId, "saved=flat"));
}

export async function endOwnership(slug: string, ownershipId: string) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!UUID.test(ownershipId)) redirect(`/${s.community.slug}/admin/people`);
  const { data: o } = await supabase.from("unit_ownerships").select("id, owner_id, start_date")
    .eq("id", ownershipId).eq("community_id", s.community.id).maybeSingle();
  if (!o) redirect(`/${s.community.slug}/admin/people`);
  const today = dayInput(s.community.timezone);
  // Linked today by mistake: remove it. Otherwise the ownership ended yesterday (end_date is inclusive).
  const { error } = o.start_date >= today
    ? await supabase.from("unit_ownerships").delete().eq("id", o.id).eq("community_id", s.community.id)
    : await supabase.from("unit_ownerships").update({ end_date: dayInput(s.community.timezone, -1) }).eq("id", o.id).eq("community_id", s.community.id);
  refresh(slug, o.owner_id);
  redirect(personPath(s.community.slug, o.owner_id, error ? "error=flat" : "saved=ownership_ended"));
}

export async function endTenancy(slug: string, tenancyId: string) {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  if (!UUID.test(tenancyId)) redirect(`/${s.community.slug}/admin/people`);
  const { data: t } = await supabase.from("tenancies").select("id, tenant_id, start_date, end_date")
    .eq("id", tenancyId).eq("community_id", s.community.id).maybeSingle();
  if (!t) redirect(`/${s.community.slug}/admin/people`);
  const today = dayInput(s.community.timezone);
  const end = t.start_date > today ? t.start_date : (t.end_date && t.end_date < today ? t.end_date : today);
  const { error } = await supabase.from("tenancies").update({ status: "ended", end_date: end }).eq("id", t.id).eq("community_id", s.community.id);
  refresh(slug, t.tenant_id);
  redirect(personPath(s.community.slug, t.tenant_id, error ? "error=flat" : "saved=tenancy_ended"));
}

// ---------------------------------------------------------------------------
// Pending tenancies (added by landlords when approval is required)
// ---------------------------------------------------------------------------
async function decideTenancy(slug: string, tenancyId: string, form: FormData, status: "active" | "ended") {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const toPerson = form.get("from") === "person";
  if (!UUID.test(tenancyId)) redirect(`/${s.community.slug}/admin/people`);
  const { data, error } = await supabase.from("tenancies").update({ status })
    .eq("id", tenancyId).eq("community_id", s.community.id).eq("status", "pending")
    .select("tenant_id").maybeSingle();
  const tenant = data?.tenant_id as string | undefined;
  refresh(slug, tenant);
  const q = error || !tenant ? "error=tenancy" : status === "active" ? "approved=1" : "declined=1";
  redirect(toPerson && tenant ? personPath(s.community.slug, tenant, q) : `/${s.community.slug}/admin/people?${q}#pending`);
}

export async function approveTenancy(slug: string, tenancyId: string, form: FormData) {
  await decideTenancy(slug, tenancyId, form, "active");
}

export async function declineTenancy(slug: string, tenancyId: string, form: FormData) {
  await decideTenancy(slug, tenancyId, form, "ended");
}
