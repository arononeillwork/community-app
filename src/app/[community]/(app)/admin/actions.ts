"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export type FaqState = { error?: string } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turn an unanswered assistant question into an FAQ entry, then take it off the list. */
export async function addToFaq(slug: string, messageId: string, _prev: FaqState, form: FormData): Promise<FaqState> {
  const s = await requireAdmin(slug);
  if (!UUID.test(messageId)) return { error: "That question could not be found." };
  const question = String(form.get("question") ?? "").trim();
  const answer = String(form.get("answer") ?? "").trim();
  if (question.length < 5) return { error: "Please write the question residents ask." };
  if (question.length > 500) return { error: "Please keep the question under 500 characters." };
  if (answer.length < 5) return { error: "Please write an answer." };
  if (answer.length > 4000) return { error: "Please keep the answer under 4,000 characters." };

  const supabase = await createClient();
  // RLS: only administrators can read unanswered questions, and only in their own community.
  const { data: msg } = await supabase.from("assistant_messages").select("id")
    .eq("id", messageId).eq("community_id", s.community.id).eq("unanswered", true).maybeSingle();
  if (!msg) return { error: "This question has already been handled." };

  const { error } = await supabase.from("faq_entries").insert({
    community_id: s.community.id, question, answer, created_by: s.userId,
  });
  if (error) return { error: "The answer could not be saved. Please try again." };
  await supabase.rpc("resolve_unanswered_question", { c: s.community.id, m: messageId });

  revalidatePath(`/${slug}/admin`);
  redirect(`/${slug}/admin?faq=1#questions`);
}

/** Take a question off the list without adding it to the FAQ (spam, duplicates, already answered in person). */
export async function dismissQuestion(slug: string, messageId: string) {
  const s = await requireAdmin(slug);
  if (!UUID.test(messageId)) return;
  const supabase = await createClient();
  await supabase.rpc("resolve_unanswered_question", { c: s.community.id, m: messageId });
  revalidatePath(`/${slug}/admin`);
  redirect(`/${slug}/admin?dismissed=1#questions`);
}
