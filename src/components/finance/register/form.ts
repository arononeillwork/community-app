/**
 * Form state shared by the register forms (contracts, suppliers, budget, quotes).
 * Plain module: used by server actions and client forms.
 *
 * React 19 resets a form after its action runs. So that people do not lose what they typed when
 * we show an error, actions return the submitted values and a stamp; the client form re-mounts
 * (key = stamp) with those values as defaults.
 */
export type FormState = { error?: string; values?: Record<string, string>; stamp?: number } | undefined;

export type FormAction = (prev: FormState, form: FormData) => Promise<FormState>;

/** Result of small one-button actions (choose, delete, toggle). */
export type ActionState = { error?: string; ok?: string } | undefined;

export type ButtonAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Build an error state that keeps what the person typed (files cannot be kept). */
export function failWith(error: string, form: FormData): FormState {
  const values: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  });
  return { error, values, stamp: Date.now() };
}

/** Value getter for a form: echoed values after an error, otherwise the initial values. */
export function valueGetter(state: FormState, initial: Record<string, string | null | undefined>) {
  return (k: string) => (state?.values ? state.values[k] ?? "" : initial[k] ?? "");
}

/** Checkbox getter: after an error use what was ticked, otherwise the initial value. */
export function checkedGetter(state: FormState, initial: Record<string, boolean | undefined>) {
  return (k: string) => (state?.values ? state.values[k] === "on" : !!initial[k]);
}

/** Trimmed text from a form field ("" when missing). */
export function text(form: FormData, name: string) {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Trimmed text or null when empty. */
export function optional(form: FormData, name: string, max = 2000) {
  const v = text(form, name);
  return v ? v.slice(0, max) : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Largest contract / quote file we accept. */
export const MAX_FILE_MB = 20;

/** Accept attribute for the contract / quote file inputs (matches the server-side check). */
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.doc,.docx,.odt,.xls,.xlsx,.ods,application/pdf,image/*";
