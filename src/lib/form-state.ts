import { z } from "zod";

/**
 * What a form-backed Server Action returns to `useActionState`. Expected failures are data, so the
 * form can render them; `message` is always safe to show a user.
 */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>;
      /** Non-secret inputs echoed back: React resets uncontrolled fields after every action. */
      values?: Readonly<Record<string, string>>;
    };

export const idleFormState: FormState = { status: "idle" };

export const formSuccess = (message: string): FormState => ({ status: "success", message });

export const formError = (
  message: string,
  fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>,
  values?: Readonly<Record<string, string>>,
): FormState => ({ status: "error", message, fieldErrors, values });

/** Turns a failed Zod parse into per-field messages without leaking schema internals. */
export function zodFormError(error: z.ZodError, values?: Record<string, string>): FormState {
  return formError("Please fix the highlighted fields.", z.flattenError(error).fieldErrors, values);
}

/** Picks the named fields out of a submission to echo back on error. Never name a password. */
export function echoFields(data: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, formText(data, name)]));
}

/** The value to show in a field: what the user last typed if the form errored, else a default. */
export function echoedValue(state: FormState, name: string, fallback = ""): string {
  return (state.status === "error" ? state.values?.[name] : undefined) ?? fallback;
}

/** Reads a form field as a string; anything else (a File, a missing key) becomes "". */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
