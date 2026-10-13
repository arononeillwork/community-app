"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember, type Session } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInput } from "@/lib/format";
import type { FormState } from "@/components/me/forms";
import { cleanPhone } from "../settings/options";
import { TENANCY_TYPES, UUID, parseDateInput } from "./tenancy";

const FAILED = "That could not be saved. Please try again.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The flat, if the signed-in person currently owns it in this community (checked with their own client). */
async function ownedUnit(supabase: Supabase, s: Session, unitId: string) {
  if (!UUID.test(unitId)) return null;
  const today = todayInput(s.community.timezone);
  const { data } = await supabase.from("unit_ownerships")
    .select("unit_id, unit:units!inner(id, label, community_id)")
    .eq("unit_id", unitId).eq("owner_id", s.userId).eq("community_id", s.community.id)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .limit(1).maybeSingle();
  const unit = data?.unit as unknown as { id: string; label: string; community_id: string } | undefined;
  return unit && unit.community_id === s.community.id ? unit : null;
}

/** A tenancy of a flat the signed-in person owns. */
async function ownedTenancy(supabase: Supabase, s: Session, tenancyId: string) {
  if (!UUID.test(tenancyId)) return null;
  const { data: t } = await supabase.from("tenancies").select("id, unit_id, start_date, end_date, status")
    .eq("id", tenancyId).eq("community_id", s.community.id).maybeSingle();
  if (!t || !(await ownedUnit(supabase, s, t.unit_id))) return null;
  return t as { id: string; unit_id: string; start_date: string; end_date: string | null; status: string };
}

export async function addTenant(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    ["unit_id", "full_name", "email", "phone", "tenancy_type", "start_date", "end_date", "note"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const result = await addTenantInner(slug, form);
  return result && { ...result, values };
}

async function addTenantInner(slug: string, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  if (!s.isOwner) return { error: "Only flat owners can add tenants." };
  const supabase = await createClient();

  const unit = await ownedUnit(supabase, s, String(form.get("unit_id") ?? ""));
  if (!unit) return { error: "You can only add a tenant to a flat you own." };

  const full_name = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(form.get("phone") ?? "").trim();
  const tenancy_type = String(form.get("tenancy_type") ?? "");
  const start_date = parseDateInput(form.get("start_date"));
  const endRaw = String(form.get("end_date") ?? "").trim();
  const end_date = endRaw ? parseDateInput(endRaw) : null;
  const note = String(form.get("note") ?? "").trim();
  const today = todayInput(s.community.timezone);

  if (full_name.length < 2 || full_name.length > 80) return { error: "Please enter your tenant's full name." };
  if (!EMAIL.test(email) || email.length > 254) return { error: "Please enter a valid email address. We send the invitation there." };
  if (email === s.email.toLowerCase()) return { error: "That is your own email address. Please enter your tenant's." };
  const phone = phoneRaw ? cleanPhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "Please check the phone number. Include the country code, for example +44 7700 900123." };
  if (!TENANCY_TYPES.some((t) => t.value === tenancy_type)) return { error: "Please choose the type of tenancy." };
  if (!start_date) return { error: "Please enter the start date." };
  if (endRaw && !end_date) return { error: "Please check the end date." };
  if (end_date && end_date < start_date) return { error: "The end date must be on or after the start date." };
  if (end_date && end_date < today) return { error: "The end date has already passed." };
  if (note.length > 300) return { error: "Please keep the note under 300 characters." };

  // Find or create the tenant's account. This needs the service role, and only runs after the
  // ownership check above.
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).limit(1).maybeSingle();
  let tenantId = existing?.id as string | undefined;
  let invited = false;
  if (tenantId) {
    // Only people who already belong to this community can be linked by an owner. Anyone else
    // (for example someone registered with another community) is added by the office, so an
    // owner can't attach a stranger's account or learn their details. The message is neutral.
    const { count: memberHere } = await admin.from("memberships").select("id", { count: "exact", head: true })
      .eq("community_id", s.community.id).eq("profile_id", tenantId).in("status", ["active", "pending"]);
    if (!memberHere) return { error: "We couldn't add this email address. Please ask the office to add your tenant." };
    const { count } = await supabase.from("tenancies").select("id", { count: "exact", head: true })
      .eq("unit_id", unit.id).eq("tenant_id", tenantId).in("status", ["active", "pending"]);
    if (count) return { error: `This person is already a tenant of ${unit.label}.` };
  } else {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data: inv, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, community_name: s.community.name, invited_by: s.fullName },
      redirectTo: `${site}/${s.community.slug}/auth/callback?next=${encodeURIComponent(`/${s.community.slug}/home`)}`,
    });
    if (error || !inv.user) return { error: "We could not send the invitation. Please check the email address and try again." };
    tenantId = inv.user.id;
    invited = true;
    if (phone) await admin.from("profiles").update({ phone }).eq("id", tenantId);
  }

  // Insert as the owner, so RLS and the tenancy triggers decide the status (approval setting).
  const { data: t, error: insertError } = await supabase.from("tenancies").insert({
    community_id: s.community.id,
    unit_id: unit.id,
    tenant_id: tenantId,
    tenancy_type,
    start_date,
    end_date,
    note: note || null,
    invited_name: full_name,
  }).select("id, status").single();
  if (insertError || !t) {
    if (invited) await admin.auth.admin.deleteUser(tenantId);
    return { error: FAILED };
  }

  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/my-units?added=${t.status}&invite=${invited ? "sent" : "existing"}&flat=${encodeURIComponent(unit.label)}`);
}

/** End access today (or withdraw a tenancy that has not started or not been approved yet). */
export async function endTenancy(slug: string, tenancyId: string) {
  const s = await requireMember(slug);
  if (!s.isOwner) redirect(`/${slug}/home`);
  const supabase = await createClient();
  const t = await ownedTenancy(supabase, s, tenancyId);
  if (!t) redirect(`/${slug}/my-units?ended=failed`);
  if (t.status !== "ended") {
    const today = todayInput(s.community.timezone);
    const { data, error } = await supabase.from("tenancies")
      .update({ status: "ended", end_date: t.start_date > today ? t.start_date : today })
      .eq("id", t.id).select("id");
    if (error || !data?.length) redirect(`/${slug}/my-units?ended=failed`);
    revalidatePath(`/${slug}`, "layout");
  }
  redirect(`/${slug}/my-units?ended=${t.status === "pending" ? "withdrawn" : "1"}`);
}

/** Move the end date, or clear it for an open-ended tenancy. */
export async function changeEndDate(slug: string, tenancyId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const s = await requireMember(slug);
  if (!s.isOwner) return { error: "Only flat owners can change a tenancy." };
  const supabase = await createClient();
  const t = await ownedTenancy(supabase, s, tenancyId);
  if (!t || t.status === "ended") return { error: "This tenancy can no longer be changed." };

  const raw = String(form.get("end_date") ?? "").trim();
  const end_date = raw ? parseDateInput(raw) : null;
  const today = todayInput(s.community.timezone);
  if (raw && !end_date) return { error: "Please check the date." };
  if (end_date && end_date < t.start_date) return { error: "The end date must be on or after the start date." };
  if (end_date && end_date < today) return { error: "Choose today or a later date. To stop access now, use End now." };

  const { error } = await supabase.from("tenancies").update({ end_date }).eq("id", t.id);
  if (error) return { error: FAILED };
  revalidatePath(`/${slug}/my-units`);
  return { ok: true, message: end_date ? "End date saved." : "Saved. This tenancy has no end date now." };
}
