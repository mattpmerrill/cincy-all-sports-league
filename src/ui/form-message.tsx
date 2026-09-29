import type { FormState } from "@/lib/form-state";
import { Alert } from "@/ui/alert";

/** Renders the outcome of a form action: nothing when idle, otherwise an alert. */
function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

/** Field-level errors from a form state, or undefined so `Field` shows none. */
function fieldErrors(state: FormState, name: string): readonly string[] | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

export { FormMessage, fieldErrors };
