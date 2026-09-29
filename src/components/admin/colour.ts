import { isAccessibleBrand } from "@/lib/color";

/** Brand colour helpers for the settings page. Pure functions: used on the client (live checks) and the server. */

export const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Accept "#0F766E", "0f766e" or "#0f7" and return "#0f766e"; null when it is not a colour code. */
export function normaliseHex(input: string | null | undefined): string | null {
  let s = String(input ?? "").trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = `#${s.slice(1).split("").map((c) => c + c).join("")}`;
  return HEX_RE.test(s) ? s.toLowerCase() : null;
}

/** Multiply every channel by `factor` (0–1): a slightly darker shade of the same colour. */
export function darken(hex: string, factor = 0.92) {
  const n = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * factor))));
  return `#${parts.map((p) => p.toString(16).padStart(2, "0")).join("")}`;
}

/** Darken in small steps until the colour is readable with white or dark text. */
export function suggestDarker(hex: string): string | null {
  const start = normaliseHex(hex);
  if (!start) return null;
  let c = start;
  for (let i = 0; i < 60; i++) {
    c = darken(c, 0.95);
    if (isAccessibleBrand(c)) return c;
  }
  return isAccessibleBrand("#111111") ? "#111111" : null;
}

export const TOO_LIGHT_OR_DARK = "This colour is too light/dark to read clearly.";

/** Plain-language problem with a colour, or null when it is fine. */
export function colourProblem(input: string | null | undefined): string | null {
  const hex = normaliseHex(input);
  if (!hex) return "Please enter a colour code like #0f766e (a # followed by six letters or numbers).";
  if (isAccessibleBrand(hex)) return null;
  const better = suggestDarker(hex);
  return better ? `${TOO_LIGHT_OR_DARK} Try ${better} instead – a slightly darker shade.` : TOO_LIGHT_OR_DARK;
}
