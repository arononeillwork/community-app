import clsx from "clsx";

/**
 * Same look as <Button> from the UI kit, for plain <button> elements that need onClick
 * (the kit's Button has no onClick prop).
 */
export function btnClass(variant: "primary" | "secondary" | "danger" | "ghost" = "primary", size: "md" | "lg" = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold no-underline transition-colors disabled:opacity-50",
    size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-12 px-5",
    variant === "primary" && "bg-brand text-brand-ink hover:brightness-110",
    variant === "secondary" && "border-2 border-line-strong bg-surface text-ink hover:bg-bg",
    variant === "danger" && "bg-bad text-white hover:brightness-110",
    variant === "ghost" && "text-ink hover:bg-bg",
    extra,
  );
}
