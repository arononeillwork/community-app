import clsx from "clsx";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { IconButton, buttonClass } from "@/components/ui";

/* Call / WhatsApp / Email actions. Links only (tel:, wa.me, mailto:), so they work on any phone. */

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function whatsappHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function mailHref(email: string) {
  return `mailto:${email}`;
}

type Props = {
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  /** "icons": compact icon buttons (lists). "buttons": icon + word (detail pages, older users). */
  variant?: "icons" | "buttons";
  className?: string;
};

export function ContactActions({ name, phone, whatsapp, email, variant = "icons", className }: Props) {
  const who = name ? ` ${name}` : "";
  const wa = whatsapp ?? null;
  if (!phone && !wa && !email) return null;

  if (variant === "buttons") {
    return (
      <div className={clsx("flex flex-wrap gap-2", className)}>
        {phone && (
          <a href={telHref(phone)} className={buttonClass("soft", "sm")} aria-label={`Call${who} on ${phone}`}>
            <Phone aria-hidden className="size-4" /> Call
          </a>
        )}
        {wa && (
          <a href={whatsappHref(wa)} target="_blank" rel="noopener noreferrer" className={buttonClass("soft", "sm")} aria-label={`WhatsApp${who}`}>
            <MessageCircle aria-hidden className="size-4" /> WhatsApp
          </a>
        )}
        {email && (
          <a href={mailHref(email)} className={buttonClass("soft", "sm")} aria-label={`Email${who} at ${email}`}>
            <Mail aria-hidden className="size-4" /> Email
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={clsx("flex shrink-0 items-center gap-1", className)}>
      {phone && <IconButton icon={Phone} label={`Call${who} on ${phone}`} href={telHref(phone)} variant="soft" />}
      {wa && <IconButton icon={MessageCircle} label={`WhatsApp${who}`} href={whatsappHref(wa)} external variant="soft" />}
      {email && <IconButton icon={Mail} label={`Email${who} at ${email}`} href={mailHref(email)} variant="soft" />}
    </div>
  );
}

/** A phone number shown as readable text that is also a call link. */
export function PhoneText({ phone, className }: { phone: string; className?: string }) {
  return (
    <a href={telHref(phone)} className={clsx("tabular whitespace-nowrap text-ink no-underline hover:underline", className)}>
      {phone}
    </a>
  );
}
