/* Choices offered on the settings page, shared by the forms and the server actions that validate them. */

export const SCALES = [100, 125, 150, 175, 200];

export const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match my device" },
] as const;

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Español", de: "Deutsch", nl: "Nederlands", sv: "Svenska", da: "Dansk", no: "Norsk",
  fi: "Suomi", fr: "Français", it: "Italiano", pt: "Português",
};

export const METHODS = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
] as const;

export const VISIBILITIES = [
  { value: "block", label: "People in my block", description: "Neighbours in your block can see your phone and email." },
  { value: "all", label: "Everyone in the community", description: "Anyone who lives here or owns a flat can see them." },
  { value: "unit", label: "Only my landlord or tenant", description: "Only the people linked to your own flat." },
  { value: "admins", label: "Only the administrators", description: "Neighbours see your name and flat, but not how to reach you." },
] as const;

export const CHANNELS = [
  { value: "push", label: "In the app" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

/** Tidy a typed phone number; null if it does not look like one. */
export function cleanPhone(input: string): string | null {
  const s = input.replace(/\s+/g, " ").trim();
  if (!/^\+?[0-9 ()\-.]{6,24}$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? s : null;
}
