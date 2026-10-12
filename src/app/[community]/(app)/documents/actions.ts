"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, type Session } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import {
  FILE_TYPES, MAX_FILE_BYTES, UUID_RE, VISIBILITIES, fileExtension, languageName, safeFileName,
} from "@/components/library/meta";

export type DocField = "title" | "folder" | "new_folder" | "description" | "visibility" | "original_language" | "extracted_text" | "file";
export type DocFormState = { error?: string; fields?: Partial<Record<DocField, string>> } | undefined;
export type TranslationField = "language" | "translated_text";
export type TranslationState = { error?: string; fields?: Partial<Record<TranslationField, string>> } | undefined;
export type DeleteResult = { error?: string } | void;

const NEW_FOLDER = "__new";
const MAX_TEXT = 200_000;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const oneLine = (v: string) => v.replace(/\s+/g, " ");
const tidyText = (v: string) => v.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();

type Checked = {
  row: { title: string; folder: string; description: string | null; visibility: string; original_language: string; extracted_text: string | null };
  file: File | null;
  fields: Partial<Record<DocField, string>>;
};

/** Read and check the document form. The file is optional here; callers decide when one is required. */
function readDocument(form: FormData, s: Session): Checked {
  const title = oneLine(text(form, "title"));
  const folderChoice = text(form, "folder");
  const folder = oneLine(folderChoice === NEW_FOLDER ? text(form, "new_folder") : folderChoice);
  const description = oneLine(text(form, "description")) || null;
  const visibility = text(form, "visibility") || "all";
  const original_language = text(form, "original_language");
  const extracted_text = tidyText(String(form.get("extracted_text") ?? "")) || null;
  const raw = form.get("file");
  const file = raw instanceof File && raw.size > 0 ? raw : null;

  const f: Partial<Record<DocField, string>> = {};
  if (title.length < 2 || title.length > 120) f.title = "Use 2 to 120 characters, for example House rules 2026.";
  if (!folder) f[folderChoice === NEW_FOLDER ? "new_folder" : "folder"] = folderChoice === NEW_FOLDER ? "Name the new folder." : "Choose a folder.";
  else if (folder.length > 40) f[folderChoice === NEW_FOLDER ? "new_folder" : "folder"] = "Keep the folder name under 40 characters.";
  if (description && description.length > 200) f.description = "Keep it to one line, under 200 characters.";
  if (!(VISIBILITIES as string[]).includes(visibility)) f.visibility = "Choose who can see it.";
  const languages = s.community.enabled_languages?.length ? s.community.enabled_languages : [s.community.default_language];
  if (!languages.includes(original_language)) f.original_language = "Choose the language it is written in.";
  if (extracted_text && extracted_text.length > MAX_TEXT) f.extracted_text = "The text is too long. Keep it under 200,000 characters.";
  if (file) {
    const ext = fileExtension(file.name);
    if (!FILE_TYPES[ext]) f.file = "Use a PDF, a photo (JPG, PNG, WebP, HEIC), or a Word or Excel file.";
    else if (file.size > MAX_FILE_BYTES) f.file = "The file is larger than 20 MB. Please make it smaller first.";
  }

  return {
    row: { title, folder: folder.charAt(0).toUpperCase() + folder.slice(1), description, visibility, original_language, extracted_text },
    file,
    fields: f,
  };
}

/** Put a file in the private "documents" bucket at <community_id>/<uuid>-<safe-name>, as the signed-in admin. */
async function storeFile(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, file: File) {
  const ext = fileExtension(file.name);
  const path = `${communityId}/${randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: FILE_TYPES[ext].mime, upsert: false });
  return error ? null : { storage_path: path, mime_type: FILE_TYPES[ext].mime, size_bytes: file.size };
}

export async function uploadDocument(slug: string, _prev: DocFormState, form: FormData): Promise<DocFormState> {
  const s = await requireAdmin(slug);
  const { row, file, fields } = readDocument(form, s);
  if (!file && !row.extracted_text && !fields.file) fields.file = "Choose a file, or paste the text of the document below.";
  if (Object.keys(fields).length) return { error: "Please check the highlighted fields.", fields };

  const supabase = await createClient();
  const stored = file ? await storeFile(supabase, s.community.id, file) : null;
  if (file && !stored) return { error: "The file could not be uploaded. Please try again." };

  const { data, error } = await supabase.from("documents")
    .insert({ ...row, ...(stored ?? {}), community_id: s.community.id, uploaded_by: s.userId })
    .select("id").single();
  if (error || !data) {
    if (stored) await supabase.storage.from("documents").remove([stored.storage_path]);
    return { error: "The document could not be saved. Please try again." };
  }

  revalidatePath(`/${slug}/documents`);
  redirect(`/${slug}/documents/${data.id}?saved=new`);
}

export async function updateDocument(slug: string, id: string, _prev: DocFormState, form: FormData): Promise<DocFormState> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This document no longer exists. It may have been deleted." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("documents").select("id, storage_path")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!current) return { error: "This document no longer exists. It may have been deleted." };

  const { row, file, fields } = readDocument(form, s);
  if (!file && !current.storage_path && !row.extracted_text && !fields.file) {
    fields.extracted_text = "Add the text, or choose a file, so residents have something to read.";
  }
  if (Object.keys(fields).length) return { error: "Please check the highlighted fields.", fields };

  // A new file replaces the old one: upload first, save, then remove the old object.
  const stored = file ? await storeFile(supabase, s.community.id, file) : null;
  if (file && !stored) return { error: "The new file could not be uploaded. Please try again." };

  const { data, error } = await supabase.from("documents").update({ ...row, ...(stored ?? {}) })
    .eq("id", id).eq("community_id", s.community.id).select("id");
  if (error || !data?.length) {
    if (stored) await supabase.storage.from("documents").remove([stored.storage_path]);
    return { error: "The document could not be saved. Please try again." };
  }
  if (stored && current.storage_path) await supabase.storage.from("documents").remove([current.storage_path]);

  revalidatePath(`/${slug}/documents`, "layout");
  redirect(`/${slug}/documents/${id}?saved=1`);
}

export async function deleteDocument(slug: string, id: string): Promise<DeleteResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This document no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete()
    .eq("id", id).eq("community_id", s.community.id).select("id, storage_path");
  if (error) return { error: "The document could not be deleted. Please try again." };
  if (!data?.length) return { error: "This document no longer exists. It may already have been deleted." };
  const path = data[0].storage_path as string | null;
  if (path) await supabase.storage.from("documents").remove([path]);

  revalidatePath(`/${slug}/documents`, "layout");
  redirect(`/${slug}/documents?deleted=1`);
}

// ---------------------------------------------------------------------------- translations
/** Add or replace the translation of a document into one of the community's languages. Admins only. */
export async function saveTranslation(slug: string, documentId: string, _prev: TranslationState, form: FormData): Promise<TranslationState> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(documentId)) return { error: "This document no longer exists." };
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, original_language")
    .eq("id", documentId).eq("community_id", s.community.id).maybeSingle();
  if (!doc) return { error: "This document no longer exists." };

  const language = text(form, "language");
  const translated_text = tidyText(String(form.get("translated_text") ?? ""));
  const f: Partial<Record<TranslationField, string>> = {};
  if (!s.community.enabled_languages.includes(language) || language === doc.original_language) f.language = "Choose one of the community's languages.";
  if (translated_text.length < 10) f.translated_text = "Paste the translated text.";
  else if (translated_text.length > MAX_TEXT) f.translated_text = "The text is too long. Keep it under 200,000 characters.";
  if (Object.keys(f).length) return { error: "Please check the highlighted fields.", fields: f };

  const { error } = await supabase.from("document_translations").upsert(
    { community_id: s.community.id, document_id: documentId, language, translated_text, status: "done" },
    { onConflict: "document_id,language" },
  );
  if (error) return { error: "The translation could not be saved. Please try again." };

  revalidatePath(`/${slug}/documents/${documentId}`, "layout");
  redirect(`/${slug}/documents/${documentId}/edit?translation=${encodeURIComponent(languageName(language))}#translations`);
}

export async function deleteTranslation(slug: string, documentId: string, language: string): Promise<DeleteResult> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(documentId) || !/^[a-z]{2,3}$/.test(language)) return { error: "This translation no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("document_translations").delete()
    .eq("document_id", documentId).eq("language", language).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The translation could not be removed. Please try again." };
  if (!data?.length) return { error: "This translation no longer exists." };
  revalidatePath(`/${slug}/documents/${documentId}`, "layout");
  redirect(`/${slug}/documents/${documentId}/edit?removed=${encodeURIComponent(languageName(language))}#translations`);
}
