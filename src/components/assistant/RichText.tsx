import Link from "next/link";
import type { ReactNode } from "react";

/* Renders an answer's plain text as calm, readable blocks: paragraphs and simple lists.
   Markdown emphasis is dropped (no bold in this app); [label](/path) links to app pages become real links. */

const LIST_ITEM = /^\s*(?:[-•*]|\d+[.)])\s+/;

function inline(text: string, base: string, key: string): ReactNode[] {
  const clean = text.replace(/\*\*|__/g, "").replace(/(^|\s)\*(\S[^*]*\S)\*(?=\s|$|[.,;:!?])/g, "$1$2");
  const out: ReactNode[] = [];
  const re = /\[([^\]]{1,120})\]\(((?:\/|https?:\/\/)[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(clean))) {
    if (m.index > last) out.push(clean.slice(last, m.index));
    const [, label, href] = m;
    // Only pages of this app become links. Outside addresses are shown as text (answers can quote
    // member-suggested content, so they must not turn into clickable links).
    out.push(href.startsWith("/") && !href.startsWith("//")
      ? <Link key={`${key}-l${i++}`} href={`${base}${href}`} className="font-medium">{label}</Link>
      : `${label} (${href})`);
    last = m.index + m[0].length;
  }
  if (last < clean.length) out.push(clean.slice(last));
  return out;
}

export default function RichText({ text, base, className }: { text: string; base: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  const nodes: ReactNode[] = [];
  blocks.forEach((block, b) => {
    let items: string[] = [];
    let ordered = false;
    const flush = (k: string) => {
      if (!items.length) return;
      const Tag = ordered ? "ol" : "ul";
      nodes.push(
        <Tag key={k} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5 marker:text-muted"}>
          {items.map((it, i) => <li key={i}>{inline(it, base, `${k}-${i}`)}</li>)}
        </Tag>,
      );
      items = [];
    };
    block.split("\n").forEach((raw, l) => {
      const line = raw.trim();
      if (!line) return;
      if (LIST_ITEM.test(line)) {
        if (!items.length) ordered = /^\d/.test(line);
        items.push(line.replace(LIST_ITEM, ""));
      } else {
        flush(`${b}-${l}-list`);
        nodes.push(<p key={`${b}-${l}`}>{inline(line, base, `${b}-${l}`)}</p>);
      }
    });
    flush(`${b}-end`);
  });
  return <div className={className ?? "space-y-2"}>{nodes}</div>;
}
