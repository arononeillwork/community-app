import type { Metadata, Viewport } from "next";
import { Figtree, Lexend } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// Figtree: clean, open and highly legible at small sizes. Lexend: optional reading-ease font.
const main = Figtree({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-main" });
const dys = Lexend({ subsets: ["latin", "latin-ext"], variable: "--font-dys" });

export const metadata: Metadata = {
  title: "Community",
  description: "Your community, all in one place",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const SCALES = new Set(["100", "125", "150", "175", "200"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Accessibility preferences live in cookies so they apply before login and on first paint.
  const jar = await cookies();
  const fs = jar.get("a11y_fs")?.value ?? "100";
  const classes = [main.variable, dys.variable];
  if (jar.get("a11y_hc")?.value === "1") classes.push("hc");
  if (jar.get("a11y_dys")?.value === "1") classes.push("dys");
  if (jar.get("a11y_rm")?.value === "1") classes.push("rm");
  const theme = jar.get("a11y_theme")?.value;
  if (theme === "dark") classes.push("dark");
  else if (theme === "system") classes.push("theme-system");
  const lang = jar.get("lang")?.value ?? "en";

  return (
    <html lang={lang} className={classes.join(" ")} style={{ fontSize: `${SCALES.has(fs) ? fs : "100"}%` }}>
      <body>{children}</body>
    </html>
  );
}
