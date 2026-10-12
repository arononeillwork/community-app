import "server-only";
import type { DB } from "./data";
import { loadPending } from "./reports";
import type { AnswerMeta, ChatMessage } from "./types";

type Row = { id: string; role: string; content: string; created_at: string; meta: AnswerMeta | Record<string, never> | null };

export function toChatMessage(r: Row): ChatMessage {
  const meta = r.meta && "engine" in r.meta ? (r.meta as AnswerMeta) : null;
  return { id: r.id, role: r.role === "user" ? "user" : "assistant", content: r.content, createdAt: r.created_at, meta };
}

/** Messages of one conversation (own rows only, by RLS), with drafted reports brought up to date. */
export async function loadMessages(db: DB, communityId: string, userId: string, conversationId: string, limit = 100): Promise<ChatMessage[]> {
  const { data } = await db.from("assistant_messages")
    .select("id, role, content, created_at, meta")
    .eq("conversation_id", conversationId).eq("community_id", communityId).in("role", ["user", "assistant"])
    .order("created_at", { ascending: false }).limit(limit);
  const messages = ((data ?? []) as Row[]).reverse().map(toChatMessage);
  const ids = messages.map((m) => m.meta?.pending?.id).filter((x): x is string => !!x);
  const live = await loadPending(db, communityId, userId, ids);
  return messages.map((m) => (m.meta?.pending && live.has(m.meta.pending.id) ? { ...m, meta: { ...m.meta, pending: live.get(m.meta.pending.id)! } } : m));
}

/** The user's most recent chat conversation in this community, if any. */
export async function latestConversation(db: DB, communityId: string, userId: string): Promise<string | null> {
  const { data } = await db.from("assistant_conversations").select("id")
    .eq("community_id", communityId).eq("profile_id", userId).eq("channel", "chat")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
