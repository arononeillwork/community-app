import "server-only";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { safeFileName } from "./dates";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|application\/vnd\.ms-excel|text\/plain)$/;

export type UploadResult = { path: string | null; error?: string };

/**
 * Upload an optional file from a form to the private "finance" bucket at
 * <community_id>/<folder>/<uuid>-<name>. Runs as the signed-in user, so storage RLS
 * (finance roles of that community only) still applies.
 */
export async function uploadFinanceFile(communityId: string, folder: "contracts" | "quotes", entry: FormDataEntryValue | null): Promise<UploadResult> {
  if (!(entry instanceof File) || entry.size === 0) return { path: null };
  if (entry.size > MAX_BYTES) return { path: null, error: `“${entry.name}” is larger than 20 MB.` };
  if (entry.type && !ALLOWED.test(entry.type)) return { path: null, error: `“${entry.name}” is not a PDF, image, Word or Excel file.` };
  const supabase = await createClient();
  const path = `${communityId}/${folder}/${randomUUID()}-${safeFileName(entry.name)}`;
  const { error } = await supabase.storage.from("finance").upload(path, entry, { contentType: entry.type || "application/octet-stream" });
  if (error) return { path: null, error: "The file could not be uploaded. Please try again." };
  return { path };
}

/** Signed download links (valid for an hour) for files in the finance bucket. */
export async function signedFinanceUrls(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("finance").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
}

/**
 * Best-effort removal of files that are no longer linked (a contract file that was replaced or
 * removed, or an upload whose record could not be saved). Storage RLS lets finance roles delete
 * only in their own community's contracts/ and quotes/ folders; a failure just leaves the file.
 */
export async function removeFinanceFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  const supabase = await createClient();
  await supabase.storage.from("finance").remove(list).catch(() => undefined);
}
