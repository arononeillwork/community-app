"use client";

import { useFormAction } from "./useFormAction";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";

type State = { error?: string } | undefined;

/** A form bound to a server action that returns { error } on failure (and redirects on success). */
export default function ActionForm({ action, children, className, id }: {
  action: (prev: State, form: FormData) => Promise<State>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const { state, formProps } = useFormAction(action);
  return (
    <form id={id} {...formProps} className={className}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {children}
    </form>
  );
}
