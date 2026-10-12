"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cancelReport, confirmReport } from "@/lib/assistant/actions";
import type { PendingReport } from "@/lib/assistant/types";
import { Badge, buttonClass } from "@/components/ui";

/** A report the assistant drafted. Nothing is sent until the resident presses "Confirm and send". */
export default function PendingReportCard({ slug, pending: initial, es, onChange, className = "mt-3" }: {
  slug: string; pending: PendingReport; es?: boolean; onChange?: (p: PendingReport) => void; className?: string;
}) {
  const [pending, setPendingState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const t = (en: string, sp: string) => (es ? sp : en);

  function setPending(p: PendingReport) {
    setPendingState(p);
    onChange?.(p);
  }

  function act(kind: "confirm" | "cancel") {
    setError(null);
    start(async () => {
      const r = kind === "confirm" ? await confirmReport(slug, pending.id) : await cancelReport(slug, pending.id);
      if (r.ok) setPending(r.pending);
      else {
        setError(r.error);
        if (r.pending) setPending(r.pending);
      }
    });
  }

  if (pending.status === "confirmed") {
    return (
      <div className={clsx(className, "flex items-start gap-3 rounded-xl bg-ok-soft px-4 py-3 text-ok")} role="status">
        <CheckCircle2 aria-hidden className="mt-0.5 size-[1.15rem] shrink-0" />
        <div className="min-w-0 text-[0.9375rem]">
          <p className="font-medium">{t("Report sent", "Aviso enviado")}</p>
          <p className="text-ink-2">{t("The office has it and will reply on the report page.", "La oficina lo tiene y responderá en la página del aviso.")}</p>
          {pending.reportId && (
            <Link href={`/${slug}/report/${pending.reportId}`} className="mt-1 inline-block font-medium">
              {t("Open the report", "Ver el aviso")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const closed = pending.status === "rejected" || pending.status === "expired";
  return (
    <section aria-label={t("Draft report", "Borrador de aviso")} className={clsx(className, "rounded-xl border border-brand-line bg-surface-2 p-4")}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
          <AlertTriangle aria-hidden className="size-[1.1rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-medium text-ink">
              {closed ? t("Draft report", "Borrador de aviso") : t("Send this report to the office?", "¿Enviar este aviso a la oficina?")}
            </h3>
            {pending.urgent && !closed && <Badge tone="bad">{t("Urgent", "Urgente")}</Badge>}
          </div>
          <p className="mt-1 break-words font-medium text-ink-2">{pending.title}</p>
          <p className="text-sm text-muted">
            {[pending.location, pending.category, pending.kind === "incident" ? t("Something broken", "Avería") : t("Complaint", "Queja")]
              .filter(Boolean).join(" · ")}
          </p>
          {/* The resident's own words, unless they only repeat the title ("Report a leak in the Block B stairs"). */}
          {!pending.description.toLowerCase().includes(pending.title.toLowerCase()) && (
            <p className="mt-2 line-clamp-4 break-words text-[0.9375rem] text-ink-2">{pending.description}</p>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-[0.9375rem] text-bad">{error}</p>}

      {closed ? (
        <p className="mt-3 text-[0.9375rem] text-muted">
          {pending.status === "expired"
            ? t("This draft has expired. Ask again to start a new report.", "Este borrador ha caducado. Vuelva a preguntar para empezar otro.")
            : t("Not sent. Nothing was passed to the office.", "No enviado. No se ha pasado nada a la oficina.")}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => act("confirm")} className={buttonClass("primary", "md")}>
            {busy ? t("Sending…", "Enviando…") : t("Confirm and send", "Confirmar y enviar")}
          </button>
          <button type="button" disabled={busy} onClick={() => act("cancel")} className={buttonClass("secondary", "md")}>
            {t("Cancel", "Cancelar")}
          </button>
          <Link href={`/${slug}/report/new`} className={buttonClass("ghost", "md")}>
            {t("Use the full form", "Usar el formulario")}
          </Link>
        </div>
      )}
    </section>
  );
}
