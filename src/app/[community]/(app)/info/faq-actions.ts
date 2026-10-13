"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/components/library/meta";

export type FaqFormState = { error?: string; savedAt?: number } | undefined;

/**
 * Change an FAQ answer (or tidy its question). Admins only; the community always comes from the session.
 * The assistant reads faq_entries on every question, so the new answer is used straight away.
 */
export async function updateFaq(slug: string, id: string, _prev: FaqFormState, form: FormData): Promise<FaqFormState> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This question no longer exists. It may have been deleted." };
  const question = String(form.get("question") ?? "").trim().replace(/\s+/g, " ");
  const answer = String(form.get("answer") ?? "").trim().replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (question.length < 5) return { error: "Please write the question residents ask." };
  if (question.length > 500) return { error: "Please keep the question under 500 characters." };
  if (answer.length < 5) return { error: "Please write an answer." };
  if (answer.length > 4000) return { error: "Please keep the answer under 4,000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("faq_entries").update({ question, answer })
    .eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The answer could not be saved. Please try again." };
  if (!data?.length) return { error: "This question no longer exists. It may have been deleted." };

  // Stay on the open question: the page refreshes with the new answer and the form closes.
  revalidatePath(`/${slug}/info`);
  return { savedAt: Date.now() };
}

/** Remove a question from the FAQ. The assistant stops using it at once. The page then shows the notice at the top. */
export async function deleteFaq(slug: string, id: string): Promise<{ error?: string; deleted?: boolean }> {
  const s = await requireAdmin(slug);
  if (!UUID_RE.test(id)) return { error: "This question no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("faq_entries").delete()
    .eq("id", id).eq("community_id", s.community.id).select("id");
  if (error) return { error: "The question could not be deleted. Please try again." };
  if (!data?.length) return { error: "This question no longer exists. It may already have been deleted." };
  revalidatePath(`/${slug}/info`);
  return { deleted: true };
}
