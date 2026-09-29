import { startTransition, type FormEvent } from "react";

/**
 * onSubmit handler that runs a useActionState action without React's automatic form reset.
 *
 * React 19 calls form.reset() after a successful `<form action={fn}>` submission. For controlled
 * radios and checkboxes that puts the ticks back to how they were when the page first loaded,
 * even though the new choice was saved. Our settings forms stay on the page after saving, so we
 * dispatch the action ourselves (inside a transition, so `pending` still works). The `action`
 * prop stays on the form so it still works before JavaScript has loaded.
 */
export function submitKeepingValues(action: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => action(form));
  };
}
