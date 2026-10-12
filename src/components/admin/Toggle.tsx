/** An on/off switch: a real checkbox (submitted as "on"), drawn as a switch. */
export default function Toggle({ name, title, text, defaultChecked }: { name: string; title: string; text?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3.5">
      <span className="min-w-0">
        <span className="block font-medium text-ink">{title}</span>
        {text && <span className="block text-[0.9375rem] text-muted">{text}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span aria-hidden className="h-7 w-12 rounded-full bg-line-strong transition-colors peer-checked:bg-brand peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--focus)] peer-focus-visible:outline-solid" />
        <span aria-hidden className="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-surface shadow-card transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
