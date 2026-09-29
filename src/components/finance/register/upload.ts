import "server-only";
import { randomUUID } from "crypto";
import type { createClient } from "@/lib/supabase/server";
import { MAX_FILE_MB } from "./form";

type Client = Awaited<ReturnType<typeof createClient>>;

const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "doc", "docx", "odt", "xls", "xlsx", "ods"];

/** The uploaded file in `name`, or null when nothing was chosen. */
export function pickFile(form: FormData, name = "file"): File | null {
  const f = form.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}

/**
 * Upload a contract or quote file to the private "finance" bucket at
 * <community_id>/<folder>/<uuid>.<ext>. Storage RLS only lets finance users write there.
 */
export async function uploadFinanceFile(
  supabase: Client, communityId: string, folder: "contracts" | "quotes", file: File,
): Promise<{ path: string } | { error: string }> {
  const ext = (file.name.includes(".") ? file.name.split(".").pop() ?? "" : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED_EXT.includes(ext)) {
    return { error: `“${file.name}” is not a file type we can keep. Please upload a PDF, a photo, or a Word or Excel file.` };
  }
  if (file.size > MAX_BYTES) return { error: `“${file.name}” is larger than ${MAX_FILE_MB} MB. Please choose a smaller file.` };

  const path = `${communityId}/${folder}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("finance").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: "The file could not be uploaded. Please try again, or save without the file." };
  return { path };
}
