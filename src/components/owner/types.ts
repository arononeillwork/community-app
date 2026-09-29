/** State returned by the owner-area server actions to their client forms (useActionState). */
export type OwnerFormState =
  | {
      error?: string;
      ok?: string;
      /** What the person typed, so the form can be refilled after an error. */
      values?: Record<string, string>;
      /** Changes on every submission; used as a React key to remount the form with fresh default values. */
      stamp?: number;
    }
  | undefined;

/** A server action with its leading arguments (slug, ids) already bound. */
export type OwnerAction = (prev: OwnerFormState, form: FormData) => Promise<OwnerFormState>;
