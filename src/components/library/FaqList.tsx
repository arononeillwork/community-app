import type { ReactNode } from "react";
import { ChevronDown, MessageCircleQuestion } from "lucide-react";
import { Card, SectionHeader } from "@/components/ui";
import RichText from "@/components/library/RichText";

export type Faq = { id: string; question: string; answer: string };

/**
 * Questions residents often ask (faq_entries). Each answer has an anchor (#faq-<id>) the assistant links to.
 * `renderAnswer` lets the page wrap an answer, e.g. with edit and delete for administrators.
 */
export default function FaqList({ items, description, renderAnswer }: {
  items: Faq[];
  description?: string;
  renderAnswer?: (faq: Faq, answer: ReactNode) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <Card padded={false} className="min-w-0">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <SectionHeader className="!mb-0" icon={MessageCircleQuestion} title="Questions residents often ask" description={description} />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {items.map((f) => {
          const answer = <RichText text={f.answer} headingAs="h4" />;
          return (
            <details key={f.id} id={`faq-${f.id}`} className="group scroll-mt-20">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 font-medium leading-snug text-ink">{f.question}</span>
                <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 pt-1 sm:px-6">
                {renderAnswer ? renderAnswer(f, answer) : answer}
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
