import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/lib/community";
import { dayInput } from "@/components/admin/format";

/* Shared by "Invite someone" and "Link to a flat": validates and writes an ownership or a tenancy.
   All writes go through the administrator's own client, so RLS ("admins manage …") applies. */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const PHONE = /^\+?[0-9 ()./-]{6,24}$/;
const TENANCY_TYPES = ["long_term", "short_term", "family", "holiday_let", "other"];

export function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function isDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type Occupancy =
  | { relation: "owner"; unitId: string }
  | { relation: "tenant"; unitId: string; tenancyType: string; start: string; end: string | null; note: string | null };

/** Read the flat (and, for tenants, the tenancy details) from a form. */
export function readOccupancy(form: FormData, relation: "owner" | "tenant", timeZone: string): { error: string } | { value: Occupancy } {
  const unitId = text(form, "unit_id");
  if (!UUID.test(unitId)) return { error: "Please choose a flat." };
  if (relation === "owner") return { value: { relation, unitId } };

  const tenancyType = text(form, "tenancy_type") || "long_term";
  if (!TENANCY_TYPES.includes(tenancyType)) return { error: "Please choose the type of tenancy." };
  const start = text(form, "start_date") || dayInput(timeZone);
  const end = text(form, "end_date") || null;
  if (!isDate(start)) return { error: "Please enter a valid start date." };
  if (end && !isDate(end)) return { error: "Please enter a valid end date, or leave it empty." };
  if (end && end < start) return { error: "The end date must be after the start date." };
  if (end && end < dayInput(timeZone)) return { error: "The end date has already passed." };
  const note = text(form, "note").slice(0, 500) || null;
  return { value: { relation, unitId, tenancyType, start, end, note } };
}

/** Check that a flat belongs to this community; returns its label. */
export async function flatLabel(supabase: SupabaseClient, s: Session, unitId: string) {
  const { data } = await supabase.from("units").select("label").eq("id", unitId).eq("community_id", s.community.id).maybeSingle();
  return (data?.label as string | undefined) ?? null;
}

/**
 * Give someone a role in this community, and for owners/tenants link them to the flat.
 * Tenant memberships are created by the tenancy trigger (sync_tenant_membership), so tenants
 * only need the tenancy. Returns an error message, or null on success.
 */
export async function grantAccess(supabase: SupabaseClient, s: Session, profileId: string, role: string, occ: Occupancy | null): Promise<string | null> {
  const c = s.community.id;
  const today = dayInput(s.community.timezone);

  if (role === "tenant") {
    if (!occ || occ.relation !== "tenant") return "Please choose a flat.";
    const { data: existing } = await supabase.from("tenancies").select("id")
      .eq("community_id", c).eq("unit_id", occ.unitId).eq("tenant_id", profileId).in("status", ["active", "pending"]).limit(1);
    if (existing?.length) return "This person already has a tenancy for that flat.";
    const { error } = await supabase.from("tenancies").insert({
      community_id: c, unit_id: occ.unitId, tenant_id: profileId, added_by: s.userId,
      tenancy_type: occ.tenancyType, start_date: occ.start, end_date: occ.end, note: occ.note, status: "active",
    });
    return error ? "The tenancy could not be saved. Please try again." : null;
  }

  const { error: mErr } = await supabase.from("memberships")
    .upsert({ community_id: c, profile_id: profileId, role, status: "active" }, { onConflict: "community_id,profile_id,role" });
  if (mErr) return "Their access could not be saved. Please try again.";

  if (role === "owner" && occ) {
    const { data: owns } = await supabase.from("unit_ownerships").select("id")
      .eq("community_id", c).eq("unit_id", occ.unitId).eq("owner_id", profileId)
      .or(`end_date.is.null,end_date.gte.${today}`).limit(1);
    if (!owns?.length) {
      const { error } = await supabase.from("unit_ownerships").insert({ community_id: c, unit_id: occ.unitId, owner_id: profileId, start_date: today });
      if (error) return "The flat could not be linked. Please try again.";
    }
  }
  return null;
}

/** Is this person part of this community (any membership, any status)? Read with the admin's own client. */
export async function isCommunityPerson(supabase: SupabaseClient, s: Session, profileId: string) {
  if (!UUID.test(profileId)) return false;
  const { data } = await supabase.from("memberships").select("id").eq("community_id", s.community.id).eq("profile_id", profileId).limit(1);
  return !!data?.length;
}
