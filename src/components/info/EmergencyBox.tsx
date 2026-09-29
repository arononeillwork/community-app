import { Phone, Siren } from "lucide-react";
import { telHref } from "./labels";

type Contact = { label: string; phone: string };

/** Big, tappable emergency phone numbers from the community's public info. */
export default function EmergencyBox({ contacts, compact = false }: { contacts: Contact[] | null | undefined; compact?: boolean }) {
  const list = (Array.isArray(contacts) ? contacts : []).filter((c) => c && typeof c.phone === "string" && c.phone.trim());
  // If the community has not added any numbers yet, fall back to the European emergency number.
  const all = list.length ? list : [{ label: "Emergencies (police, fire, ambulance)", phone: "112" }];
  const shown = compact ? all.slice(0, 1) : all;

  return (
    <section aria-labelledby="emergency-heading" className="rounded-card border-2 border-bad/40 bg-bad-soft p-5 sm:p-6">
      <h2 id="emergency-heading" className="mb-1 flex items-center gap-2 text-2xl font-bold text-bad">
        <Siren aria-hidden className="size-7" /> In an emergency
      </h2>
      <p className="mb-4 text-ink">Tap a number to call it straight away.</p>
      <ul className={compact ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {shown.map((c) => (
          <li key={`${c.label}-${c.phone}`}>
            <a href={telHref(c.phone)}
              className="flex min-h-16 items-center gap-4 rounded-xl border-2 border-bad/40 bg-surface px-4 py-3 text-ink no-underline hover:border-bad">
              <Phone aria-hidden className="size-7 shrink-0 text-bad" />
              <span className="flex flex-col">
                <span className="font-bold">{c.label}</span>
                <span className="tabular text-2xl font-bold text-bad">{c.phone}</span>
              </span>
              <span className="sr-only">: tap to call</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
