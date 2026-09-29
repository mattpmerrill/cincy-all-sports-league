"use server";

import { redirect } from "next/navigation";
import {
  echoFields,
  formError,
  formSuccess,
  formText,
  zodFormError,
  type FormState,
} from "@/lib/form-state";
import { getAuthService } from "./auth.server";
import { requireUser } from "./guards";
import { requestOrigin } from "./origin";
import { safeNextPath } from "./safe-next";
import { resetRequestSchema, signInSchema, signUpSchema, updatePasswordSchema } from "./schemas";

// Every action here is a public entry point (anyone can POST it), so each one validates its own
// input. redirect() works by throwing, so it is always called outside try/catch.

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formText(formData, "displayName"),
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  const echo = echoFields(formData, "displayName", "email");
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const next = safeNextPath(formText(formData, "next"), "/me");
  const result = await (await getAuthService()).signUp(parsed.data, await requestOrigin(), next);
  if (!result.ok) return formError(result.error.message, undefined, echo);
  if (result.value.needsConfirmation) {
    return formSuccess(
      "Almost there. We sent a link to confirm your account. It can take a minute, and it may land in your spam or junk folder, so check there too.",
    );
  }
  redirect(next);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  const echo = echoFields(formData, "email");
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const result = await (await getAuthService()).signIn(parsed.data.email, parsed.data.password);
  if (!result.ok) return formError(result.error.message, undefined, echo);
  redirect(safeNextPath(formText(formData, "next"), "/"));
}

export async function signOutAction(): Promise<void> {
  // A failed sign-out still leaves the user on a page that re-checks their session, so send them
  // home either way rather than showing an error for something they can retry.
  await (await getAuthService()).signOut();
  redirect("/");
}

export async function signInWithGoogleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const next = safeNextPath(formText(formData, "next"), "/me");
  const result = await (await getAuthService()).startGoogleSignIn(await requestOrigin(), next);
  if (!result.ok) return formError(result.error.message);
  redirect(result.value);
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formText(formData, "email") });
  const echo = echoFields(formData, "email");
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const result = await (
    await getAuthService()
  ).requestPasswordReset(parsed.data.email, await requestOrigin());
  if (!result.ok) return formError(result.error.message, undefined, echo);
  // Same answer whether or not the address has an account, so this can't be used to probe.
  return formSuccess(
    "If that email has an account, a reset link is on its way. Check your spam or junk folder if you don't see it.",
  );
}

export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formText(formData, "password"),
    confirmPassword: formText(formData, "confirmPassword"),
  });
  if (!parsed.success) return zodFormError(parsed.error);

  const user = await requireUser();
  if (!user.ok) {
    return formError("That reset link has expired. Request a new one to continue.");
  }
  const result = await (await getAuthService()).updatePassword(parsed.data.password);
  if (!result.ok) return formError(result.error.message);
  redirect("/me");
}
