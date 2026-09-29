/** Shows `text` with the search words marked. */
export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded bg-warn-soft px-0.5 text-ink">{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
