"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInput } from "@/lib/format";
import {
  EMAIL_RE, ISO_DATE_RE, ROLE_LABELS, TENANCY_TYPES, isRole, needsFlat, previousDay, type AdminRole,
} from "@/components/admin/labels";
import type { AdminState } from "@/components/admin/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const CONFIRM_FIRST = "Please press the button again and choose “Yes” to confirm.";

function str(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function article(role: AdminRole) {
  return role === "owner" || role === "admin" ? `an ${ROLE_LABELS[role].toLowerCase()}` : `a ${ROLE_LABELS[role].toLowerCase()}`;
}

/** Everything under /<slug> may show people (contacts, my flat, admin), so refresh it all. */
function refresh(slug: string) {
  revalidatePath(`/${slug}`, "layout");
}

/**
 * After an action whose button disappears on success (the record changed state), go back to the page
 * with a "done" key so it can show a clear confirmation. Never called inside try/catch.
 */
function done(slug: string, key: string, profileId?: string): never {
  refresh(slug);
  redirect(profileId ? `/${slug}/admin/people/${profileId}?done=${key}` : `/${slug}/admin/people?done=${key}#pending`);
}

/* ---------------------------------------------------------------------------
   Helpers (all run AS THE SIGNED-IN ADMIN, so RLS double-checks every write)
   --------------------------------------------------------------------------- */

async function findFlat(supabase: Db, communityId: string, unitId: string) {
  if (!unitId) return null;
  const { data } = await supabase.from("units").select("id, label").eq("id", unitId).eq("community_id", communityId).maybeSingle();
  return data ? { id: String(data.id), label: String(data.label) } : null;
}

/** Stop an admin from locking the community out (removing themselves or the last administrator). */
async function adminRemovalProblem(supabase: Db, communityId: string, profileId: string, callerId: string) {
  if (profileId === callerId) {
    return "You cannot remove your own administrator role. Please ask another administrator to do it.";
  }
  const { count, error } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("role", "admin")
    .eq("status", "active")
    .neq("profile_id", profileId);
  if (error) return "Something went wrong. Please try again.";
  if (!count) return "This is the only administrator. Please make someone else an administrator first.";
  return null;
}

/** End current and waiting tenancies (all of one tenant's, or a single one). Returns how many were ended. */
async function endTenancies(supabase: Db, communityId: string, today: string, by: { tenantId?: string; tenancyId?: string }) {
  let q = supabase.from("tenancies").select("id, start_date, end_date").eq("community_id", communityId).in("status", ["active", "pending"]);
  if (by.tenantId) q = q.eq("tenant_id", by.tenantId);
  if (by.tenancyId) q = q.eq("id", by.tenancyId);
  const { data, error } = await q;
  if (error) return { error: true, count: 0 };
  let failed = false;
  for (const t of data ?? []) {
    const start = String(t.start_date ?? "");
    const end = t.end_date ? String(t.end_date) : null;
    // Record today as the last day, unless the tenancy had not started yet (then it is simply cancelled).
    const patch: Record<string, string> = { status: "ended" };
    if (start && start <= today && (!end || end > today)) patch.end_date = today;
    const { error: upErr } = await supabase.from("tenancies").update(patch).eq("id", t.id).eq("community_id", communityId);
    if (upErr) failed = true;
  }
  return { error: failed, count: (data ?? []).length };
}

/** End current ownerships (all of one owner's, or a single one): the last day of ownership becomes yesterday. */
async function endOwnerships(supabase: Db, communityId: string, today: string, by: { ownerId?: string; ownershipId?: string }) {
  let q = supabase
    .from("unit_ownerships")
    .update({ end_date: previousDay(today) })
    .eq("community_id", communityId)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (by.ownerId) q = q.eq("owner_id", by.ownerId);
  if (by.ownershipId) q = q.eq("id", by.ownershipId);
  const { error } = await q;
  return !error;
}

/** Set one role to ended, plus what goes with it (tenants lose their tenancies, owners their flats). */
async function endRoleAndLinks(supabase: Db, communityId: string, profileId: string, role: AdminRole, today: string) {
  const { error } = await supabase
    .from("memberships")
    .update({ status: "ended" })
    .eq("community_id", communityId)
    .eq("profile_id", profileId)
    .eq("role", role);
  if (error) return false;
  if (role === "tenant") {
    const r = await endTenancies(supabase, communityId, today, { tenantId: profileId });
    if (r.error) return false;
  }
  if (role === "owner") {
    if (!(await endOwnerships(supabase, communityId, today, { ownerId: profileId }))) return false;
  }
  return true;
}

/**
 * Give someone a role. Owners are linked to a flat (unit_ownerships), tenants get a tenancy.
 * The flat link is written first, so a failure never leaves a role without its flat.
 * Returns a friendly error, or null when everything was saved.
 */
async function grantRole(
  supabase: Db,
  communityId: string,
  profileId: string,
  role: AdminRole,
  today: string,
  flat?: { unitId: string; tenancyType?: string; endDate?: string | null },
): Promise<string | null> {
  if (role === "owner" && flat) {
    const { data: dup } = await supabase
      .from("unit_ownerships")
      .select("id")
      .eq("community_id", communityId)
      .eq("unit_id", flat.unitId)
      .eq("owner_id", profileId)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .limit(1);
    if (!dup || dup.length === 0) {
      const { error } = await supabase.from("unit_ownerships").insert({ community_id: communityId, unit_id: flat.unitId, owner_id: profileId });
      if (error) return "The flat could not be linked to this owner. Please try again.";
    }
  }

  if (role === "tenant" && flat) {
    const { data: dup } = await supabase
      .from("tenancies")
      .select("id, status")
      .eq("community_id", communityId)
      .eq("unit_id", flat.unitId)
      .eq("tenant_id", profileId)
      .in("status", ["active", "pending"])
      .limit(1);
    const existing = dup?.[0];
    if (existing && existing.status === "pending") {
      const { error } = await supabase.from("tenancies").update({ status: "active" }).eq("id", existing.id).eq("community_id", communityId);
      if (error) return "The waiting tenancy could not be approved. Please try again.";
    } else if (!existing) {
      // Added by an administrator, so the database makes it active straight away.
      const { error } = await supabase.from("tenancies").insert({
        community_id: communityId,
        unit_id: flat.unitId,
        tenant_id: profileId,
        tenancy_type: flat.tenancyType || "long_term",
        end_date: flat.endDate || null,
      });
      if (error) return "The tenancy could not be saved. Please check the details and try again.";
    }
  }

  const { error } = await supabase
    .from("memberships")
    .upsert({ community_id: communityId, profile_id: profileId, role, status: "active" }, { onConflict: "community_id,profile_id,role" });
  if (error) return "The role could not be saved. Please try again.";
  return null;
}

/**
 * Find a person by email, or send them an invitation.
 * The service-role client is used ONLY here, and only after requireAdmin() has passed.
 */
async function findOrInvite(slug: string, email: string, fullName: string):
  Promise<{ id: string; name: string; invited: boolean } | { error: string }> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("profiles").select("id, full_name").eq("email", email).limit(1);
  if (error) return { error: "Something went wrong while checking that email address. Please try again." };
  if (rows && rows.length > 0) {
    return { id: String(rows[0].id), name: String(rows[0].full_name || fullName || email), invited: false };
  }

  if (fullName.length < 2) {
    return { error: "This person does not have an account yet. Please type their full name so we can invite them." };
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const { data: inv, error: invError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${site}/${slug}/auth/callback`,
  });
  if (inv?.user) return { id: inv.user.id, name: fullName, invited: true };

  // Rare: the account exists but its profile has a different email on file. Look the account up instead.
  if (invError && /already|registered|exists/i.test(invError.message)) {
    for (let page = 1; page <= 10; page++) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError || !list) break;
      const u = list.users.find((x) => (x.email ?? "").toLowerCase() === email);
      if (u) return { id: u.id, name: fullName || email, invited: false };
      if (list.users.length < 1000) break;
    }
  }
  return { error: "We could not send an invitation to that email address. Please check the address and try again in a few minutes." };
}

async function loadMembership(supabase: Db, communityId: string, membershipId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("id, profile_id, role, status, profile:profiles(full_name, email)")
    .eq("id", membershipId)
    .eq("community_id", communityId)
    .maybeSingle();
  if (!data || !isRole(data.role)) return null;
  const p = data.profile as unknown as { full_name: string | null; email: string | null } | null;
  return {
    id: String(data.id),
    profileId: String(data.profile_id),
    role: data.role as AdminRole,
    status: String(data.status),
    name: p?.full_name || p?.email || "This person",
  };
}

/* ---------------------------------------------------------------------------
   Actions
   --------------------------------------------------------------------------- */

/** Add a person (or give an existing person another role / flat). */
export async function addPerson(slug: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const fullName = str(form.get("full_name")).slice(0, 120);
  const email = str(form.get("email")).toLowerCase();
  const role = str(form.get("role"));
  const unitId = str(form.get("unit_id"));
  const tenancyType = str(form.get("tenancy_type")) || "long_term";
  const endDate = str(form.get("end_date"));

  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Please enter a valid email address, like name@example.com." };
  if (!isRole(role)) return { error: "Please choose what this person is: owner, tenant, administrator or treasurer." };

  let flatLabel = "";
  if (needsFlat(role)) {
    if (!unitId) return { error: `Please choose the flat this ${ROLE_LABELS[role].toLowerCase()} belongs to.` };
    const flat = await findFlat(supabase, cid, unitId);
    if (!flat) return { error: "That flat could not be found. Please choose it again." };
    flatLabel = flat.label;
  }
  if (role === "tenant") {
    if (!(TENANCY_TYPES as readonly string[]).includes(tenancyType)) return { error: "Please choose the type of tenancy." };
    if (endDate && (!ISO_DATE_RE.test(endDate) || endDate < today)) {
      return { error: "The end date must be today or later. Leave it empty if the tenancy has no end date." };
    }
  }

  const person = await findOrInvite(slug, email, fullName);
  if ("error" in person) return { error: person.error };

  if (!needsFlat(role)) {
    const { data: existing } = await supabase
      .from("memberships").select("status")
      .eq("community_id", cid).eq("profile_id", person.id).eq("role", role).maybeSingle();
    if (existing?.status === "active") return { error: `${person.name} is already ${article(role)} here.` };
  } else if (role === "owner") {
    const { data: dup } = await supabase
      .from("unit_ownerships").select("id")
      .eq("community_id", cid).eq("unit_id", unitId).eq("owner_id", person.id)
      .or(`end_date.is.null,end_date.gte.${today}`).limit(1);
    if (dup && dup.length > 0) return { error: `${person.name} is already an owner of flat ${flatLabel}.` };
  } else {
    const { data: dup } = await supabase
      .from("tenancies").select("id")
      .eq("community_id", cid).eq("unit_id", unitId).eq("tenant_id", person.id).eq("status", "active").limit(1);
    if (dup && dup.length > 0) return { error: `${person.name} is already a tenant of flat ${flatLabel}.` };
  }

  const problem = await grantRole(supabase, cid, person.id, role, today,
    needsFlat(role) ? { unitId, tenancyType, endDate: endDate || null } : undefined);
  if (problem) return { error: problem };

  refresh(slug);
  const what = needsFlat(role) ? `${article(role)} of flat ${flatLabel}` : article(role);
  return {
    ok: person.invited
      ? `${person.name} has been added as ${what}. We have emailed them an invitation to sign in.`
      : `${person.name} has been added as ${what}. They can sign in with their usual email address.`,
  };
}

/** Approve a tenancy that a landlord added (the database only lets administrators do this). */
export async function approveTenancy(slug: string, tenancyId: string): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const { data: t } = await supabase
    .from("tenancies")
    .select("id, status, end_date")
    .eq("id", tenancyId).eq("community_id", cid).maybeSingle();
  if (!t) return { error: "That tenancy could not be found. It may have been removed." };
  if (t.status !== "pending") return { error: "This tenancy is no longer waiting for approval." };
  if (t.end_date && String(t.end_date) < today) {
    return { error: "The end date of this tenancy has already passed, so it cannot be approved. Please decline it instead." };
  }

  const { data: updated, error } = await supabase
    .from("tenancies").update({ status: "active" })
    .eq("id", tenancyId).eq("community_id", cid).eq("status", "pending")
    .select("id");
  if (error || !updated || updated.length === 0) return { error: "The tenancy could not be approved. Please try again." };

  done(slug, "approved");
}

/** Decline a waiting tenancy (it is ended, not deleted, so there is a record). */
export async function declineTenancy(slug: string, tenancyId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("tenancies").update({ status: "ended" })
    .eq("id", tenancyId).eq("community_id", s.community.id).eq("status", "pending")
    .select("id");
  if (error) return { error: "The tenancy could not be declined. Please try again." };
  if (!updated || updated.length === 0) return { error: "This tenancy is no longer waiting for approval." };
  done(slug, "declined");
}

/** Change one of a person's roles into another role. */
export async function changeRole(slug: string, membershipId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  const supabase = await createClient();
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const m = await loadMembership(supabase, cid, membershipId);
  if (!m) return { error: "That role could not be found. It may already have been changed." };
  if (m.status !== "active") return { error: "Only a current role can be changed." };

  const newRole = str(form.get("new_role"));
  if (!isRole(newRole)) return { error: "Please choose the new role." };
  if (newRole === m.role) return { error: `${m.name} is already ${article(newRole)}. Please choose a different role.` };

  let flat: { unitId: string; tenancyType?: string } | undefined;
  if (needsFlat(newRole)) {
    const unitId = str(form.get("unit_id"));
    if (!unitId) return { error: `Please choose the flat for the new ${ROLE_LABELS[newRole].toLowerCase()} role.` };
    if (!(await findFlat(supabase, cid, unitId))) return { error: "That flat could not be found. Please choose it again." };
    flat = { unitId, tenancyType: "long_term" };
  }

  if (m.role === "admin") {
    const problem = await adminRemovalProblem(supabase, cid, m.profileId, s.userId);
    if (problem) return { error: problem };
  }

  const grantProblem = await grantRole(supabase, cid, m.profileId, newRole, today, flat);
  if (grantProblem) return { error: grantProblem };
  if (!(await endRoleAndLinks(supabase, cid, m.profileId, m.role, today))) {
    refresh(slug);
    return { error: `${m.name} is now ${article(newRole)}, but the old ${ROLE_LABELS[m.role].toLowerCase()} role could not be ended. Please try ending it again.` };
  }

  done(slug, `now_${newRole}`, m.profileId);
}

/** End one role. Tenants also lose their tenancy; owners stop being listed as owners of their flats. */
export async function endRole(slug: string, membershipId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  const supabase = await createClient();
  const cid = s.community.id;

  const m = await loadMembership(supabase, cid, membershipId);
  if (!m) return { error: "That role could not be found. It may already have been removed." };
  if (m.status === "ended") return { error: "This role has already ended." };
  if (m.role === "admin" && m.status === "active") {
    const problem = await adminRemovalProblem(supabase, cid, m.profileId, s.userId);
    if (problem) return { error: problem };
  }

  if (!(await endRoleAndLinks(supabase, cid, m.profileId, m.role, todayInput(s.community.timezone)))) {
    refresh(slug);
    return { error: "The role could not be ended completely. Please try again." };
  }
  done(slug, `ended_${m.role}`, m.profileId);
}

/** Give back an administrator or treasurer role that had ended. */
export async function restoreRole(slug: string, membershipId: string): Promise<AdminState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();
  const m = await loadMembership(supabase, s.community.id, membershipId);
  if (!m) return { error: "That role could not be found." };
  if (needsFlat(m.role)) {
    return { error: `To make ${m.name} ${article(m.role)} again, use “Give a role or flat” below and choose the flat.` };
  }
  if (m.status === "active") return { error: `${m.name} is already ${article(m.role)}.` };
  const { error } = await supabase.from("memberships").update({ status: "active" }).eq("id", m.id).eq("community_id", s.community.id);
  if (error) return { error: "The role could not be given back. Please try again." };
  done(slug, `restored_${m.role}`, m.profileId);
}

/** Remove a person from the community completely: every role, tenancy and ownership ends. */
export async function removeFromCommunity(slug: string, profileId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  if (profileId === s.userId) return { error: "You cannot remove yourself. Please ask another administrator to do it." };
  const supabase = await createClient();
  const cid = s.community.id;
  const today = todayInput(s.community.timezone);

  const { data: roles, error } = await supabase
    .from("memberships").select("role, status").eq("community_id", cid).eq("profile_id", profileId);
  if (error) return { error: "Something went wrong. Please try again." };
  if (!roles || roles.length === 0) return { error: "This person could not be found in this community." };
  if (roles.some((r) => r.role === "admin" && r.status === "active")) {
    const problem = await adminRemovalProblem(supabase, cid, profileId, s.userId);
    if (problem) return { error: problem };
  }

  const { error: mErr } = await supabase
    .from("memberships").update({ status: "ended" })
    .eq("community_id", cid).eq("profile_id", profileId).neq("status", "ended");
  const t = await endTenancies(supabase, cid, today, { tenantId: profileId });
  const o = await endOwnerships(supabase, cid, today, { ownerId: profileId });
  if (mErr || t.error || !o) {
    refresh(slug);
    return { error: "Not everything could be ended. Please try again." };
  }
  done(slug, "removed", profileId);
}

/** End one flat ownership (for example after the flat was sold). */
export async function endOwnership(slug: string, ownershipId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("unit_ownerships").select("owner_id").eq("id", ownershipId).eq("community_id", s.community.id).maybeSingle();
  if (!row) return { error: "That ownership could not be found. It may already have ended." };
  const ok = await endOwnerships(supabase, s.community.id, todayInput(s.community.timezone), { ownershipId });
  if (!ok) return { error: "The ownership could not be ended. Please try again." };
  done(slug, "ownership_ended", String(row.owner_id));
}

/** End one tenancy now. */
export async function endTenancy(slug: string, tenancyId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const s = await requireAdmin(slug);
  if (form.get("confirm") !== "yes") return { error: CONFIRM_FIRST };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("tenancies").select("tenant_id").eq("id", tenancyId).eq("community_id", s.community.id).maybeSingle();
  if (!row) return { error: "That tenancy could not be found." };
  const r = await endTenancies(supabase, s.community.id, todayInput(s.community.timezone), { tenancyId });
  if (r.error) return { error: "The tenancy could not be ended. Please try again." };
  if (r.count === 0) return { error: "This tenancy has already ended." };
  done(slug, "tenancy_ended", String(row.tenant_id));
}
