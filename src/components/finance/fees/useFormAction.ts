"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * useActionState for a form, submitted through onSubmit instead of the `action` prop.
 * React resets a form after every `action` submission, which would wipe what an older user
 * typed whenever the server answers with an error. Submitting this way keeps the values;
 * give the form a `key` that changes on success to clear it only then.
 */
export function useFormAction<S>(action: (prev: S, form: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (prev: Awaited<S>, form: FormData) => Promise<S>,
    undefined as Awaited<S>,
  );
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }
  return [state, onSubmit, pending] as const;
}
