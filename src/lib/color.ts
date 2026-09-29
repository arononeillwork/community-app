/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text colour for a brand background: white or near-black, whichever reads better. */
export function inkFor(bg: string) {
  return contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111";
}

/** Brand colours must reach WCAG AA (4.5:1) against white text or dark text. */
export function isAccessibleBrand(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) && Math.max(contrast(hex, "#ffffff"), contrast(hex, "#111111")) >= 4.5;
}
