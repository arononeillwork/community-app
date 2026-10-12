import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Plain text as calm, readable blocks:
 *   "• " or "- " lines → a bulleted list, "1. " lines → a numbered list,
 *   "## Heading" or a short line ending in ":" → a small heading, everything else → paragraphs.
 */
type Block =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: { n: string; text: string }[] };

const BULLET = /^\s*[•\-–*]\s+/;
const NUMBER = /^\s*\d{1,3}[.)]\s+/;

export function parseText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) { blocks.push({ t: "p", text: "" }); continue; }
    if (line.startsWith("## ") || line.startsWith("# ")) { blocks.push({ t: "h", text: line.replace(/^#+\s+/, "") }); continue; }
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.t === "ul") last.items.push(item); else blocks.push({ t: "ul", items: [item] });
      continue;
    }
    if (NUMBER.test(line)) {
      const item = { n: line.match(/\d{1,3}/)![0], text: line.replace(NUMBER, "") };
      if (last?.t === "ol") last.items.push(item); else blocks.push({ t: "ol", items: [item] });
      continue;
    }
    if (line.endsWith(":") && line.length <= 60) { blocks.push({ t: "h", text: line.slice(0, -1) }); continue; }
    blocks.push({ t: "p", text: line });
  }
  return blocks.filter((b) => b.t !== "p" || b.text);
}

export default function RichText({ text, size = "base", headingAs: H = "h3", className }: {
  text: string; size?: "base" | "reading"; headingAs?: "h3" | "h4"; className?: string;
}) {
  const reading = size === "reading";
  const out: ReactNode[] = parseText(text).map((b, i) => {
    switch (b.t) {
      case "h":
        return <H key={i} className={clsx("font-semibold text-ink [&:not(:first-child)]:mt-5", reading ? "text-[1.0625rem]" : "text-[0.9375rem]")}>{b.text}</H>;
      case "ul":
        return (
          <ul key={i} className="flex flex-col gap-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className={clsx("mt-[0.7em] size-1.5 shrink-0 rounded-full bg-brand/70")} />
                <span className="min-w-0">{it}</span>
              </li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={i} className="flex flex-col gap-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="tabular w-6 shrink-0 text-right text-muted">{it.n}.</span>
                <span className="min-w-0"><span className="sr-only">{it.n}. </span>{it.text}</span>
              </li>
            ))}
          </ol>
        );
      default:
        return <p key={i}>{b.text}</p>;
    }
  });
  return (
    <div className={clsx("flex flex-col text-ink-2",
      reading ? "max-w-[68ch] gap-3.5 text-[1.0625rem] leading-[1.75]" : "gap-2.5 text-[0.9375rem] leading-relaxed", className)}>
      {out}
    </div>
  );
}
