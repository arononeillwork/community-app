"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submit handler that sends the form to a useActionState action without React's automatic
 * form reset, so a validation error keeps everything the person typed.
 */
export function keepValuesSubmit(formAction: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
}

/** Accessible props for a field that may have an error. */
export function fieldProps(name: string, errors: Record<string, string> | undefined, hintId?: string) {
  const err = errors?.[name];
  const describedBy = [err ? `${name}-error` : null, hintId].filter(Boolean).join(" ");
  return {
    id: name,
    name,
    "aria-invalid": err ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

export function FieldError({ name, errors }: { name: string; errors: Record<string, string> | undefined }) {
  const err = errors?.[name];
  if (!err) return null;
  return <p id={`${name}-error`} className="text-sm text-bad">{err}</p>;
}
