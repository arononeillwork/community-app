"use client";

import { startTransition, useActionState, type FormEvent } from "react";

type State = { error?: string } | undefined;

/**
 * useActionState for forms that must keep what the person typed when the server says "please fix X".
 * React resets a <form action={fn}> after every submission; submitting from onSubmit inside a
 * transition skips that reset, while `action` keeps the form working before JavaScript has loaded.
 */
export function useFormAction(action: (prev: State, form: FormData) => Promise<State>) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => formAction(data));
  };
  return { state, pending, formProps: { action: formAction, onSubmit } };
}
