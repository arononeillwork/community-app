import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AskContext } from "./context";
import { answerWithClaude, claudeAvailable } from "./claude";
import { answerWithoutAI, type EngineAnswer } from "./fallback";

/** Questions per person per day that may use Claude; beyond this, answers come from the community's data. */
const DAILY_CLAUDE_LIMIT = 60;

async function underDailyLimit(ctx: AskContext): Promise<boolean> {
  const since = new Date(ctx.now.getTime() - 86400000).toISOString();
  const { count } = await ctx.db.from("assistant_messages")
    .select("id, conversation:assistant_conversations!inner(profile_id)", { count: "exact", head: true })
    .eq("community_id", ctx.s.community.id).eq("role", "user").eq("conversation.profile_id", ctx.s.userId).gte("created_at", since);
  return (count ?? 0) <= DAILY_CLAUDE_LIMIT;
}

/** Answer one question: Claude when a key is configured (and within limits), otherwise retrieval. */
export async function answer(
  ctx: AskContext,
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<EngineAnswer> {
  if (claudeAvailable() && (await underDailyLimit(ctx))) {
    try {
      return await answerWithClaude(ctx, question, history);
    } catch (e) {
      // Never leave the resident without an answer: fall back to the community's own data.
      if (e instanceof Anthropic.AuthenticationError) console.error("assistant: ANTHROPIC_API_KEY was rejected");
      else if (e instanceof Anthropic.RateLimitError) console.error("assistant: rate limited by the Claude API");
      else if (e instanceof Anthropic.APIError) console.error(`assistant: Claude API error ${e.status}`, e.message);
      else console.error("assistant: Claude call failed", e);
    }
  }
  return answerWithoutAI(ctx, question);
}

export { claudeAvailable };
