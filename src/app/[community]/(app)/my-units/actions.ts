"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { date, todayInput } from "@/lib/format";
import { TENANCY_TYPE_VALUES } from "@/components/owner/labels";
import type { OwnerFormState } from "@/components/owner/types";

type UserClient = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A real calendar date in YYYY-MM-DD form. */
function isDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

/** Does the signed-in user currently own this flat? Asked AS THE USER, so RLS applies too. */
async function callerOwnsUnit(supabase: UserClient, communityId: string, userId: string, unitId: string, today: string) {
  const { data, error } = await supabase
    .from("unit_ownerships")
    .select("id")
    .eq("community_id", communityId)
    .eq("unit_id", unitId)
    .eq("owner_id", userId)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/** Load a tenancy the caller may manage (they must own its flat). */
async function loadManagedTenancy(slug: string, tenancyId: string) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const today = todayInput(s.community.timezone);
  if (!UUID.test(tenancyId)) return { s, supabase, today, error: "We could not find that tenancy." } as const;

  const { data } = await supabase
    .from("tenancies")
    .select("id, unit_id, start_date, end_date, status")
    .eq("id", tenancyId)
    .eq("community_id", s.community.id)
    .maybeSingle();
  const t = data as { id: string; unit_id: string; start_date: string; end_date: string | null; status: string } | null;
  if (!t) return { s, supabase, today, error: "We could not find that tenancy." } as const;
  if (!(await callerOwnsUnit(supabase, s.community.id, s.userId, t.unit_id, today))) {
    return { s, supabase, today, error: "You can only change tenancies for a flat you own." } as const;
  }
  return { s, supabase, today, t } as const;
}

// ---------------------------------------------------------------------------
// Add a tenant
// ---------------------------------------------------------------------------
export async function addTenant(slug: string, _prev: OwnerFormState, form: FormData): Promise<OwnerFormState> {
  const s = await requireMember(slug);

  const values = {
    full_name: text(form, "full_name"),
    email: text(form, "email").toLowerCase(),
    phone: text(form, "phone"),
    tenancy_type: text(form, "tenancy_type"),
    start_date: text(form, "start_date"),
    end_date: text(form, "end_date"),
    note: text(form, "note"),
  };
  const fail = (error: string): OwnerFormState => ({ error, values, stamp: Date.now() });

  if (!s.isOwner) return fail("Only flat owners can add tenants.");
  const unitId = text(form, "unit_id");
  if (!UUID.test(unitId)) return fail("Please choose one of your flats.");

  // Check what was typed.
  if (values.full_name.length < 2) return fail("Please enter your tenant's full name.");
  if (values.full_name.length > 120) return fail("The name is too long. Please shorten it.");
  if (!EMAIL.test(values.email) || values.email.length > 200) return fail("Please enter a valid email address, for example name@example.com.");
  if (values.phone.length > 40) return fail("The phone number is too long.");
  if (values.phone && !/^[+\d][\d\s().-]{4,}$/.test(values.phone)) return fail("Please enter the phone number using digits only, for example +34 600 123 456.");
  if (!TENANCY_TYPE_VALUES.includes(values.tenancy_type)) return fail("Please choose the type of tenancy.");
  if (!isDate(values.start_date)) return fail("Please enter the start date.");
  if (values.end_date && !isDate(values.end_date)) return fail("The end date is not a valid date.");
  if (values.note.length > 500) return fail("The note is too long. Please keep it under 500 characters.");

  const supabase = await createClient();
  const today = todayInput(s.community.timezone);
  if (values.end_date) {
    if (values.end_date < values.start_date) return fail("The end date must be on or after the start date.");
    if (values.end_date < today) return fail("The end date is in the past. Please choose today or a later date.");
  }

  // 1. The caller must own this flat (checked as the user, with RLS).
  if (!(await callerOwnsUnit(supabase, s.community.id, s.userId, unitId, today))) {
    return fail("You can only add tenants to a flat you own.");
  }
  if (values.email === s.email.toLowerCase()) {
    return fail("That is your own email address. Please enter your tenant's email address.");
  }

  // 2. Find the person by email, or invite them. The service-role client is used ONLY for this
  //    (and for filling in an empty phone number), after the ownership check above.
  const admin = createAdminClient();
  const { data: found, error: findError } = await admin
    .from("profiles")
    .select("id, phone")
    .eq("email", values.email)
    .limit(1);
  if (findError) return fail("Something went wrong while checking that email address. Please try again.");

  let tenantId: string;
  let existingPhone: string | null = null;
  let invited = false;
  if (found && found.length > 0) {
    tenantId = found[0].id as string;
    existingPhone = (found[0].phone as string | null) ?? null;
  } else {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data: inv, error: inviteError } = await admin.auth.admin.inviteUserByEmail(values.email, {
      data: { full_name: values.full_name },
      redirectTo: `${site}/${slug}/auth/callback`,
    });
    if (inviteError || !inv?.user) {
      return fail("We could not send an invitation to that email address. Please check the address and try again in a few minutes.");
    }
    tenantId = inv.user.id;
    invited = true;
  }
  if (tenantId === s.userId) return fail("That is your own account. Please enter your tenant's email address.");

  if (values.phone && !existingPhone) {
    // Only fill the phone number if the profile has none (never overwrite someone's own details).
    // The extra filter keeps this safe if someone filled it in meanwhile.
    const update = admin.from("profiles").update({ phone: values.phone }).eq("id", tenantId);
    await (existingPhone === "" ? update.eq("phone", "") : update.is("phone", null));
  }

  // 3. Not already a current tenant of this flat?
  const { data: dup } = await supabase
    .from("tenancies")
    .select("id")
    .eq("unit_id", unitId)
    .eq("tenant_id", tenantId)
    .in("status", ["active", "pending"])
    .limit(1);
  if (dup && dup.length > 0) return fail(`${values.full_name} is already a tenant of this flat.`);

  // 4. Insert AS THE USER: RLS checks ownership again, and the trigger sets status + added_by.
  const { data: row, error: insertError } = await supabase
    .from("tenancies")
    .insert({
      community_id: s.community.id,
      unit_id: unitId,
      tenant_id: tenantId,
      tenancy_type: values.tenancy_type,
      start_date: values.start_date,
      end_date: values.end_date || null,
      note: values.note || null,
    })
    .select("status")
    .single();
  if (insertError || !row) return fail("The tenant could not be added. Please check the details and try again.");

  revalidatePath(`/${slug}/my-units`);

  const name = values.full_name;
  const invite = invited
    ? `We have emailed ${values.email} an invitation to join.`
    : "They already have an account, so no invitation email was needed.";
  let ok: string;
  if (row.status === "pending") {
    ok = `${name} has been added. The office must approve this tenancy before ${name} can use the app. ${invite}`;
  } else if (row.status === "ended") {
    ok = `${name} has been added, but the tenancy is already marked as ended.`;
  } else {
    ok = `${name} has been added. ${invite} They can also sign in at any time with “Email me a link” on the sign-in page.`;
  }
  return { ok, stamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Change the end date of a tenancy
// ---------------------------------------------------------------------------
export async function changeTenancyEndDate(slug: string, tenancyId: string, _prev: OwnerFormState, form: FormData): Promise<OwnerFormState> {
  const loaded = await loadManagedTenancy(slug, tenancyId);
  if ("error" in loaded) return { error: loaded.error };
  const { s, supabase, today, t } = loaded;

  const endDate = text(form, "end_date");
  if (endDate && !isDate(endDate)) return { error: "Please enter a valid end date, or leave it empty." };
  if (t.status === "ended") {
    return { error: "This tenancy has already ended. To give this person access again, add them as a new tenant." };
  }
  if (endDate && endDate < t.start_date) return { error: `The end date cannot be before the start date (${date(t.start_date)}).` };
  if (endDate && endDate < today) return { error: "The end date cannot be in the past. To end the tenancy today, use “End tenancy now”." };
  if ((endDate || null) === t.end_date) return { ok: "Nothing to change: that is already the end date." };

  const { data, error } = await supabase
    .from("tenancies")
    .update({ end_date: endDate || null })
    .eq("id", t.id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error || !data?.length) return { error: "The end date could not be saved. Please try again, or contact the office." };

  revalidatePath(`/${slug}/my-units`);
  return { ok: endDate ? `Saved. The tenancy now ends on ${date(endDate)}.` : "Saved. The tenancy is now open-ended (no end date)." };
}

// ---------------------------------------------------------------------------
// End a tenancy now
// ---------------------------------------------------------------------------
export async function endTenancy(slug: string, tenancyId: string, _prev: OwnerFormState, form: FormData): Promise<OwnerFormState> {
  if (form.get("confirm") !== "yes") return { error: "Please confirm that you want to end the tenancy." };
  const loaded = await loadManagedTenancy(slug, tenancyId);
  if ("error" in loaded) return { error: loaded.error };
  const { s, supabase, today, t } = loaded;

  if (t.status === "ended") return { error: "This tenancy has already ended." };
  // A tenancy that has not started yet cannot end before its start date (database rule), so it ends on that day.
  const endDate = t.start_date > today ? t.start_date : today;

  const { data, error } = await supabase
    .from("tenancies")
    .update({ end_date: endDate, status: "ended" })
    .eq("id", t.id)
    .eq("community_id", s.community.id)
    .select("id");
  if (error || !data?.length) return { error: "The tenancy could not be ended. Please try again, or contact the office." };

  revalidatePath(`/${slug}/my-units`);
  redirect(`/${slug}/my-units?flat=${t.unit_id}&ended=1`);
}
