/* IBAN helpers: basic structure and the ISO 13616 mod-97 checksum, which catches almost every typo. */

const LENGTHS: Record<string, number> = {
  ES: 24, PT: 25, FR: 27, DE: 22, GB: 22, IE: 22, NL: 18, BE: 16, IT: 27, SE: 24, NO: 15, DK: 18, FI: 18, CH: 21, AT: 20, LU: 20, GI: 23,
};

export function normaliseIban(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validIban(raw: string) {
  const iban = normaliseIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = LENGTHS[iban.slice(0, 2)];
  if (expected && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const n = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    rem = Number(`${rem}${n}`) % 97;
  }
  return rem === 1;
}

/** "ES9820383015423500084567" → "ES98 2038 3015 4235 0008 4567". */
export function formatIban(v: string) {
  return normaliseIban(v).replace(/(.{4})/g, "$1 ").trim();
}

// The masked form shown on screen ("ES•• •••• 4567") comes from the database: suppliers.iban_masked
// (migration 20261013000500), so pages never load the full number.
