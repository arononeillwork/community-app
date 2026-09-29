/** Result of an administration server action: a friendly error, or a friendly success message. */
export type AdminState = { error?: string; ok?: string } | undefined;

/** A server action with its slug (and record id) already bound, ready for useActionState. */
export type AdminAction = (prev: AdminState, form: FormData) => Promise<AdminState>;
