import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { latestConversation, loadMessages } from "@/lib/assistant/conversation";
import { claudeAvailable } from "@/lib/assistant/engine";
import Chat from "@/components/assistant/Chat";

export const metadata = { title: "Ask a question" };

const SPEECH_LANG: Record<string, string> = { en: "en-GB", es: "es-ES", de: "de-DE", nl: "nl-NL", sv: "sv-SE", da: "da-DK", no: "nb-NO", fr: "fr-FR" };

export default async function AskPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { community } = await params;
  const { q } = await searchParams;
  const s = await requireMember(community);
  const supabase = await createClient();

  const conversationId = await latestConversation(supabase, s.community.id, s.userId);
  const messages = conversationId ? await loadMessages(supabase, s.community.id, s.userId, conversationId) : [];
  const lang = s.prefs?.language ?? s.community.default_language;

  return (
    <div className="mx-auto max-w-3xl">
      <Chat
        slug={s.community.slug}
        communityName={s.community.name}
        firstName={s.fullName.split(" ")[0] ?? ""}
        initialConversationId={conversationId}
        initialMessages={messages}
        aiOn={claudeAvailable()}
        prefill={typeof q === "string" ? q.slice(0, 500) : undefined}
        speechLang={SPEECH_LANG[lang] ?? "en-GB"}
      />
    </div>
  );
}
