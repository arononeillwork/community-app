"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import type { AskContext } from "./context";
import { latestConversation, toChatMessage } from "./conversation";
import { answer } from "./engine";
import { cancelDraft, confirmDraft } from "./reports";
import { detectLang } from "./text";
import type { AskResult, Lang, PendingResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTION = 1000;

/**
 * Ask the community assistant. Re-checks membership, stores the question in the user's own
 * conversation, answers it (Claude with tools, or the community's data without a key) and
 * stores the answer. Unanswered questions are flagged so the office can add an FAQ entry.
 */
export async function ask(slug: string, conversationId: string | null, question: string): Promise<AskResult> {
  const s = await requireMember(slug);
  const text = String(question ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 2) return { ok: false, error: "Please type a question." };
  if (text.length > MAX_QUESTION) return { ok: false, error: `Please keep your question under ${MAX_QUESTION} characters.` };

  const db = await createClient();
  const c = s.community.id;

  // Use the given conversation only if it is the caller's own, in this community (RLS + explicit check).
  let convId: string | null = null;
  if (conversationId && UUID.test(conversationId)) {
    const { data } = await db.from("assistant_conversations").select("id")
      .eq("id", conversationId).eq("community_id", c).eq("profile_id", s.userId).maybeSingle();
    convId = (data?.id as string | undefined) ?? null;
  }
  if (!convId) {
    const { data, error } = await db.from("assistant_conversations")
      .insert({ community_id: c, profile_id: s.userId, channel: "chat" }).select("id").single();
    if (error || !data) return { ok: false, error: "Your question could not be saved. Please try again." };
    convId = data.id as string;
  }

  const { data: history } = await db.from("assistant_messages").select("role, content")
    .eq("conversation_id", convId).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);

  const { data: q, error: qErr } = await db.from("assistant_messages")
    .insert({ community_id: c, conversation_id: convId, role: "user", content: text })
    .select("id, role, content, created_at, meta").single();
  if (qErr || !q) return { ok: false, error: "Your question could not be saved. Please try again." };

  const prefLang: Lang = s.prefs?.language === "es" ? "es" : "en";
  const ctx: AskContext = { s, db, lang: detectLang(text, prefLang), tz: s.community.timezone, now: new Date() };

  let result;
  try {
    result = await answer(ctx, text, ((history ?? []) as { role: "user" | "assistant"; content: string }[]).reverse());
  } catch (e) {
    console.error("assistant: answer failed", e);
    // The question goes back into the box for another try; don't leave it in the history unanswered.
    await db.from("assistant_messages").delete().eq("id", q.id);
    return { ok: false, error: "Something went wrong while looking that up. Please try again." };
  }

  const { data: a, error: aErr } = await db.from("assistant_messages")
    .insert({ community_id: c, conversation_id: convId, role: "assistant", content: result.text.slice(0, 8000), meta: result.meta })
    .select("id, role, content, created_at, meta").single();
  if (aErr || !a) {
    await db.from("assistant_messages").delete().eq("id", q.id);
    return { ok: false, error: "The answer could not be saved. Please try again." };
  }
  if (result.unanswered) {
    await db.from("assistant_messages").update({ unanswered: true }).eq("id", q.id);
  }

  return { ok: true, conversationId: convId, question: toChatMessage(q), answer: toChatMessage(a) };
}

/** Start afresh. Reuses the latest conversation if it is still empty, so empty ones don't pile up. */
export async function startConversation(slug: string): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const s = await requireMember(slug);
  const db = await createClient();
  const latest = await latestConversation(db, s.community.id, s.userId);
  if (latest) {
    const { count } = await db.from("assistant_messages").select("id", { count: "exact", head: true }).eq("conversation_id", latest);
    if (!count) return { ok: true, conversationId: latest };
  }
  const { data, error } = await db.from("assistant_conversations")
    .insert({ community_id: s.community.id, profile_id: s.userId, channel: "chat" }).select("id").single();
  if (error || !data) return { ok: false, error: "A new conversation could not be started. Please try again." };
  return { ok: true, conversationId: data.id as string };
}

/** Send a report the assistant drafted. Only the person who asked can confirm it. */
export async function confirmReport(slug: string, pendingId: string): Promise<PendingResult> {
  const s = await requireMember(slug);
  if (!UUID.test(pendingId)) return { ok: false, error: "That draft could not be found." };
  const db = await createClient();
  const r = await confirmDraft(db, s.community.id, s.userId, pendingId);
  if (r.ok) {
    revalidatePath(`/${slug}/report`);
    revalidatePath(`/${slug}/home`);
  }
  return r;
}

export async function cancelReport(slug: string, pendingId: string): Promise<PendingResult> {
  const s = await requireMember(slug);
  if (!UUID.test(pendingId)) return { ok: false, error: "That draft could not be found." };
  const db = await createClient();
  return cancelDraft(db, s.community.id, s.userId, pendingId);
}
