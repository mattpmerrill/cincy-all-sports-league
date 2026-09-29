import type { AuthFailure, AuthFailureCode } from "@/data/auth.repository";
import { err, type Result } from "@/lib/result";

/** User-facing copy per failure. Raw provider errors never reach the screen. */
const MESSAGES: Record<AuthFailureCode, string> = {
  invalid_credentials: "That email and password don't match. Try again or reset your password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link we sent.",
  email_taken: "An account with that email already exists. Try signing in instead.",
  weak_password: "That password is too easy to guess. Try a longer or less common one.",
  same_password: "Choose a password different from your current one.",
  invalid_email: "That email address doesn't look right.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  invalid_link: "That link has expired or was already used. Request a new one and try again.",
  unauthenticated: "Your session has ended. Sign in again to continue.",
  unknown: "Something went wrong on our side. Please try again in a moment.",
};

export type AuthAppError = { code: AuthFailureCode; message: string };

export const authMessage = (code: AuthFailureCode): string => MESSAGES[code];

export function toAuthError(failure: AuthFailure): Result<never, AuthAppError> {
  return err(failure.code, authMessage(failure.code));
}
