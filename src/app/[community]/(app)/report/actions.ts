"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/community";

export type ReportState = { error?: string } | undefined;

const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export async function createReport(slug: string, _prev: ReportState, form: FormData): Promise<ReportState> {
  const s = await requireMember(slug);
  const supabase = await createClient();

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (title.length < 3) return { error: "Please give the problem a short title." };
  if (description.length < 3) return { error: "Please describe what happened." };

  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) return { error: `Please attach at most ${MAX_PHOTOS} photos.` };
  for (const p of photos) {
    if (!p.type.startsWith("image/")) return { error: `“${p.name}” is not a photo.` };
    if (p.size > MAX_BYTES) return { error: `“${p.name}” is larger than 10 MB.` };
  }

  // Photos go to the private "complaints" bucket under <community_id>/<report id>/.
  const reportId = randomUUID();
  const paths: string[] = [];
  for (const p of photos) {
    const ext = (p.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${s.community.id}/${reportId}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("complaints").upload(path, p, { contentType: p.type });
    if (error) return { error: "A photo could not be uploaded. Please try again." };
    paths.push(path);
  }

  const targetType = String(form.get("target_type") ?? "common_area");
  const { error } = await supabase.from("complaints").insert({
    id: reportId,
    community_id: s.community.id,
    kind: form.get("kind") === "incident" ? "incident" : "complaint",
    category_id: form.get("category_id") || null,
    target_type: targetType,
    target_unit_id: targetType === "unit" ? form.get("target_unit_id") || null : null,
    target_supplier_id: targetType === "supplier" ? form.get("target_supplier_id") || null : null,
    location: String(form.get("location") ?? "").trim() || null,
    title,
    description,
    priority: form.get("urgent") ? "urgent" : "normal",
    photo_paths: paths,
  });
  if (error) return { error: "Your report could not be saved. Please try again." };

  revalidatePath(`/${slug}/report`);
  redirect(`/${slug}/report/${reportId}?sent=1`);
}

export async function addUpdate(slug: string, id: string, form: FormData) {
  const s = await requireMember(slug);
  const supabase = await createClient();
  const body = String(form.get("body") ?? "").trim();
  const status = s.isAdmin ? String(form.get("status") ?? "") : "";
  if (!body && !status) return;
  if (status) {
    await supabase.from("complaints").update({ status }).eq("id", id);
  }
  await supabase.from("complaint_updates").insert({
    community_id: s.community.id, complaint_id: id, author_id: s.userId,
    body: body || `Status changed to ${status.replace(/_/g, " ")}`, new_status: status || null,
  });
  revalidatePath(`/${slug}/report/${id}`);
}
