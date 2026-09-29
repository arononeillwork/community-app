import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to a useActionState action WITHOUT React's automatic form reset,
 * so nothing the person typed is lost when the server answers with an error.
 * (Native validation such as `required` still runs first.)
 */
export function submitKeepingValues(dispatch: (payload: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}
