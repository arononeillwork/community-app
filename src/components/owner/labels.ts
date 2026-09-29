/** Tenancy types (public.tenancy_type enum) with plain-language labels and explanations. */
export const TENANCY_TYPES = [
  { value: "long_term", label: "Long-term", help: "A normal rental, usually a year or more." },
  { value: "short_term", label: "Short-term", help: "A rental of a few weeks or months." },
  { value: "family", label: "Family member", help: "A relative living in your flat." },
  { value: "holiday_let", label: "Holiday let", help: "Holiday guests renting your flat." },
  { value: "other", label: "Other", help: "Anything else. Please explain in the note." },
] as const;

export type TenancyType = (typeof TENANCY_TYPES)[number]["value"];

export const TENANCY_TYPE_VALUES: readonly string[] = TENANCY_TYPES.map((t) => t.value);

export function tenancyTypeLabel(v: string | null | undefined) {
  return TENANCY_TYPES.find((t) => t.value === v)?.label ?? "Other";
}

/** public.payment_method enum → words. */
const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  direct_debit: "Direct debit",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export function paymentMethodLabel(v: string | null | undefined) {
  return (v && PAYMENT_METHODS[v]) ?? "Other";
}
