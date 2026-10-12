import { contrast, inkFor, isAccessibleBrand } from "@/lib/color";

/* Brand colour helpers for the branding form (browser) and the save action (server). */

export const HEX = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string) {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

function toHex(rgb: number[]) {
  return "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Mix two colours in sRGB, like CSS color-mix(in srgb, a (1 - t), b t). */
export function mix(a: string, b: string, t: number) {
  const x = toRgb(a), y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** The nearest accessible colour: darken or lighten in small steps until text on it reaches 4.5:1. */
export function suggestAccessible(hex: string) {
  if (!HEX.test(hex) || isAccessibleBrand(hex)) return hex.toLowerCase();
  for (let step = 1; step <= 20; step++) {
    const darker = mix(hex, "#000000", step * 0.04);
    if (isAccessibleBrand(darker)) return darker;
    const lighter = mix(hex, "#ffffff", step * 0.04);
    if (isAccessibleBrand(lighter)) return lighter;
  }
  return "#0f766e";
}

/** What the app does with a brand colour, for the live preview and the contrast check. */
export function brandPreview(hex: string) {
  const ink = inkFor(hex);
  return {
    ink,
    ratio: contrast(hex, ink),
    ok: isAccessibleBrand(hex),
    soft: mix(hex, "#ffffff", 0.91),   // --brand-soft: 9 % brand on white
    text: mix(hex, "#000000", 0.18),   // --brand-text: 82 % brand, 18 % black
  };
}
