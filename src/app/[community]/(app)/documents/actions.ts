"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/community";
import { safeFileName } from "@/components/info/labels";

export type UploadState = {
  error?: string;
  /** What the admin typed, so the form can be refilled after an error. */
  values?: Record<string, string>;
  at?: number;
} | undefined;

/** Keep well under the server action body limit (next.config.ts) and the storage limit (supabase/config.toml). */
const MAX_BYTES = 25 * 1024 * 1024;
const VISIBILITIES = ["all", "owners", "admins"];

export async function uploadDocument(slug: string, _prev: UploadState, form: FormData): Promise<UploadState> {
  const s = await requireAdmin(slug);
  const supabase = await createClient();

  const values = Object.fromEntries(
    ["title", "folder", "description", "visibility", "language"].map((k) => [k, String(form.get(k) ?? "").trim()]),
  );
  const fail = (error: string): UploadState => ({ error, values, at: Date.now() });

  const title = values.title;
  if (title.length < 3) return fail("Please give the document a title.");
  if (title.length > 200) return fail("The title is too long. Please shorten it.");
  const folder = (values.folder || "General").slice(0, 60);
  const visibility = VISIBILITIES.includes(values.visibility) ? values.visibility : "";
  if (!visibility) return fail("Please choose who can see this document.");
  const languages = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  const language = languages.includes(values.language) ? values.language : s.community.default_language;

  const raw = form.get("file");
  const file = raw instanceof File && raw.size > 0 ? raw : null;
  if (file && file.size > MAX_BYTES) return fail("The file is larger than 25 MB. Please choose a smaller file.");

  // Upload first, to the private "documents" bucket at <community_id>/<uuid>-<filename>.
  let storagePath: string | null = null;
  let extracted: string | null = null;
  if (file) {
    storagePath = `${s.community.id}/${randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("documents").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) return fail("The file could not be uploaded. Please try again.");
    // Plain text files can be shown on the page straight away; other formats wait for the assistant feature.
    if (file.type.startsWith("text/plain") && file.size < 1024 * 1024) {
      extracted = (await file.text()).slice(0, 200_000) || null;
    }
  }

  const id = randomUUID();
  const { error } = await supabase.from("documents").insert({
    id,
    community_id: s.community.id,
    folder,
    title,
    description: values.description.slice(0, 4000) || null,
    storage_path: storagePath,
    mime_type: file ? file.type || null : null,
    size_bytes: file ? file.size : null,
    visibility,
    original_language: language,
    extracted_text: extracted,
    uploaded_by: s.userId,
  });
  if (error) {
    if (storagePath) await supabase.storage.from("documents").remove([storagePath]);
    return fail("The document could not be saved. Please try again.");
  }

  revalidatePath(`/${slug}/documents`);
  redirect(`/${slug}/documents/${id}?added=1`);
}
