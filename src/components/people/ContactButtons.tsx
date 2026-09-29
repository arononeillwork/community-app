import clsx from "clsx";
import { Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { clean, mailHref, telHref, waHref } from "./contact";

type Option = { key: "phone" | "whatsapp" | "email"; href: string; label: string; icon: LucideIcon; external: boolean };

/**
 * Big Call / WhatsApp / Email buttons. Only shows a button when that detail is available.
 * The person's preferred way comes first and is highlighted.
 */
export default function ContactButtons({ name, phone, email, preferred, size = "lg" }: {
  name: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  preferred: string | null | undefined;
  size?: "md" | "lg";
}) {
  const p = clean(phone);
  const e = clean(email);
  const opts: Option[] = [];
  if (p) {
    opts.push({ key: "phone", href: telHref(p), label: "Call", icon: Phone, external: false });
    const wa = waHref(p);
    if (wa) opts.push({ key: "whatsapp", href: wa, label: "WhatsApp", icon: MessageCircle, external: true });
  }
  if (e) opts.push({ key: "email", href: mailHref(e), label: "Email", icon: Mail, external: false });
  if (opts.length === 0) return null;

  // Stable sort: preferred first, the rest keep their order.
  opts.sort((a, b) => Number(b.key === preferred) - Number(a.key === preferred));

  return (
    <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {opts.map((o) => {
        const isPreferred = o.key === preferred;
        return (
          <li key={o.key}>
            <a
              href={o.href}
              {...(o.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={clsx(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl font-bold no-underline transition-colors sm:w-auto",
                size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-12 px-5",
                isPreferred
                  ? "bg-brand text-brand-ink ring-2 ring-brand ring-offset-2 hover:brightness-110"
                  : "border-2 border-line-strong bg-surface text-ink hover:bg-bg",
              )}
            >
              <o.icon aria-hidden className="size-6 shrink-0" />
              <span>
                {o.label}
                <span className="sr-only"> {name}</span>
              </span>
              {isPreferred && <span className="text-base font-normal">(preferred)</span>}
              {o.external && <span className="sr-only"> (opens WhatsApp in a new tab)</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
