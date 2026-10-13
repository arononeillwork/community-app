import clsx from "clsx";
import { Clock, Lock } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { ContactActions, PhoneText } from "@/components/contact";
import { METHOD_LABELS, relationLabel, whatsappFor, type DirRow } from "./types";

type Person = Pick<DirRow, "full_name" | "relation" | "tenancy_type" | "email" | "phone" | "preferred_method" | "best_times" | "shared" | "is_me">;

/** The person's name with their "You" marker and role badges. */
function NameLine({ p, badges }: { p: Person; badges: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium text-ink">{p.full_name}</span>
      {p.is_me && <Badge tone="brand" dot={false}>You</Badge>}
      {badges.map((b) => <Badge key={b} tone="info" dot={false}>{b}</Badge>)}
    </div>
  );
}

/** Shown instead of contact buttons. Role holders can still be reached through their role contact. */
function NotShared({ roleHolder }: { roleHolder: boolean }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
      <Lock aria-hidden className="size-3.5 shrink-0" />
      {roleHolder ? "Reach them through Key contacts" : "Doesn't share contact details"}
    </div>
  );
}

/**
 * A person in a flat. "list": compact row with icon actions (block lists, neighbours); the WhatsApp
 * icon only appears when it is their preferred way, so the row needs no extra words.
 * "detail": larger, with the phone number, preferred method, best times and worded buttons.
 */
export function PersonLine({ p, badges = [], variant = "list", as: As = "li", className }: {
  p: Person; badges?: string[]; variant?: "list" | "detail"; as?: "li" | "div"; className?: string;
}) {
  const canContact = p.shared && !p.is_me && !!(p.phone || p.email);
  const relation = relationLabel(p);

  if (variant === "detail") {
    const facts = [relation, p.shared && p.preferred_method ? METHOD_LABELS[p.preferred_method] : null].filter(Boolean);
    return (
      <As className={clsx("flex gap-3.5", className)}>
        <Avatar name={p.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <NameLine p={p} badges={badges} />
          <div className="mt-0.5 text-[0.9375rem] text-muted">{facts.join(" · ")}</div>
          {p.shared && (p.phone || p.email) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.9375rem]">
              {p.phone && <PhoneText phone={p.phone} />}
              {p.email && <span className="min-w-0 break-all text-ink-2">{p.email}</span>}
            </div>
          )}
          {p.shared && p.best_times && (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Clock aria-hidden className="size-3.5 shrink-0" /> <span><span className="sr-only">Best time to call: </span>{p.best_times}</span>
            </div>
          )}
          {!p.shared && !p.is_me && <NotShared roleHolder={badges.length > 0} />}
          {canContact && (
            <ContactActions className="mt-3" variant="buttons" name={p.full_name} phone={p.phone} whatsapp={whatsappFor(p)} email={p.email} />
          )}
        </div>
      </As>
    );
  }

  return (
    <As className={clsx("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]", className)}>
      <Avatar name={p.full_name} />
      <div className="min-w-0">
        <NameLine p={p} badges={badges} />
        <div className="text-sm text-muted">{relation}</div>
        {!p.shared && !p.is_me && <NotShared roleHolder={badges.length > 0} />}
      </div>
      {canContact && (
        <ContactActions className="col-start-2 sm:col-start-auto" name={p.full_name} phone={p.phone} whatsapp={whatsappFor(p)} email={p.email} />
      )}
    </As>
  );
}
