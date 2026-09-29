import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Clock, Lock, Mail, MessageSquare, Phone } from "lucide-react";
import ContactButtons from "./ContactButtons";
import { METHOD_LABELS, clean } from "./contact";

/** One person with their contact details and big contact buttons (used for landlords and the committee). */
export default function PersonCard({
  name, details, preferred, bestTimes, phone, email, prominent = false, isYou = false, settingsHref, privateText,
}: {
  name: string;
  details?: ReactNode;
  preferred: string | null | undefined;
  bestTimes: string | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
  prominent?: boolean;
  isYou?: boolean;
  settingsHref: string;
  privateText: string;
}) {
  const p = clean(phone);
  const e = clean(email);
  const times = clean(bestTimes);
  const hasContact = !!(p || e);

  return (
    <article
      className={clsx(
        "card flex flex-col gap-4 rounded-card p-5 sm:p-6",
        prominent ? "border-2 border-brand bg-brand-soft" : "border border-line bg-surface",
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className={clsx("font-bold leading-tight", prominent ? "text-2xl" : "text-xl")}>
          {name || "Name not given"}
          {isYou && <span className="font-normal text-muted"> (you)</span>}
        </h3>
        {details}
      </div>

      <ul className="flex flex-col gap-2">
        {preferred && (
          <li className="flex items-start gap-2">
            <MessageSquare aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
            <span><strong>Prefers:</strong> {METHOD_LABELS[preferred] ?? preferred}</span>
          </li>
        )}
        {times && (
          <li className="flex items-start gap-2">
            <Clock aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
            <span><strong>Best times:</strong> {times}</span>
          </li>
        )}
        {p && (
          <li className="flex items-start gap-2">
            <Phone aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
            <span><strong>Phone:</strong> <span className="tabular">{p}</span></span>
          </li>
        )}
        {e && (
          <li className="flex items-start gap-2">
            <Mail aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
            <span className="min-w-0 break-all"><strong>Email:</strong> {e}</span>
          </li>
        )}
      </ul>

      {isYou ? (
        <p className="text-muted">
          This is you.{" "}
          <Link href={settingsHref} className="font-bold text-brand underline">Change what you share</Link>
        </p>
      ) : hasContact ? (
        <ContactButtons name={name} phone={p} email={e} preferred={preferred} />
      ) : (
        <p className="flex items-start gap-2 text-muted">
          <Lock aria-hidden className="mt-1 size-5 shrink-0" />
          <span>{privateText}</span>
        </p>
      )}
      {!isYou && preferred === "letter" && (
        <p className="hint">They prefer a letter. You can leave one at the community office or in their letterbox.</p>
      )}
    </article>
  );
}
