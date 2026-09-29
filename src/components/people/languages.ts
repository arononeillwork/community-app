/** Language names written in their own language, so people can find theirs. */
const NATIVE: Record<string, string> = {
  en: "English",
  es: "Español",
  ca: "Català",
  eu: "Euskara",
  gl: "Galego",
  de: "Deutsch",
  nl: "Nederlands",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
  sv: "Svenska",
  da: "Dansk",
  no: "Norsk",
  nb: "Norsk bokmål",
  fi: "Suomi",
  pl: "Polski",
  ro: "Română",
  ru: "Русский",
  uk: "Українська",
  ga: "Gaeilge",
  ar: "العربية",
  zh: "中文",
};

function display(code: string, locale: string) {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Unknown or invalid language code.
  }
  return null;
}

/** "Español (Spanish)", "English", "Deutsch (German)". */
export function languageOption(code: string) {
  const native = NATIVE[code] ?? display(code, code) ?? code.toUpperCase();
  const english = display(code, "en");
  return english && english !== native ? `${native} (${english})` : native;
}
