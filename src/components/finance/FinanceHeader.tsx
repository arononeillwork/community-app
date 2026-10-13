import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";

/**
 * Top of every Finance page, like the Administration pages: the page's own h1 under a small "Finance" label.
 * The Finance layout only adds the section tabs above it. Status badges sit at the start of the line under the title,
 * so the heading itself stays the page's name.
 */
export default function FinanceHeader({ title, intro, badge, actions, back, eyebrow = "Finance" }: {
  title: ReactNode;
  /** One short line under the title (supplier, dates…). */
  intro?: ReactNode;
  /** Status badges shown before the intro line. */
  badge?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Defaults to "Finance"; pass null on a page whose title already says Finance. */
  eyebrow?: ReactNode;
}) {
  const line = badge ? (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="inline-flex flex-wrap items-center gap-1.5">{badge}</span>
      {intro != null && intro !== "" && <span>{intro}</span>}
    </span>
  ) : intro;
  return <PageHeader title={title} intro={line} actions={actions} back={back} eyebrow={eyebrow ?? undefined} />;
}
