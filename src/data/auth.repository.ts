import type { AuthError, EmailOtpType } from "@supabase/supabase-js";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { DbClient } from "./db-client";

/**
 * Stable codes for the ways Supabase Auth can refuse. `message` carries the vendor's own error
 * code for logs only; callers must map the `code` to user-facing copy and never show `message`.
 */
export type AuthFailureCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "same_password"
  | "invalid_email"
  | "rate_limited"
  | "invalid_link"
  | "unauthenticated"
  | "unknown";

export type AuthFailure = AppError<AuthFailureCode>;
export type SessionUser = { id: string };

function fail(error: AuthError): Result<never, AuthFailure> {
  const vendor = error.code ?? String(error.status ?? "unknown");
  const code = ((): AuthFailureCode => {
    switch (error.code) {
      case "invalid_credentials":
        return "invalid_credentials";
      case "email_not_confirmed":
        return "email_not_confirmed";
      case "user_already_exists":
      case "email_exists":
        return "email_taken";
      case "weak_password":
        return "weak_password";
      case "same_password":
        return "same_password";
      case "email_address_invalid":
      case "validation_failed":
        return "invalid_email";
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return "rate_limited";
      case "otp_expired":
      case "flow_state_not_found":
      case "flow_state_expired":
      case "bad_code_verifier":
      case "bad_oauth_callback":
        return "invalid_link";
      case "session_not_found":
      case "session_expired":
      case "refresh_token_not_found":
        return "unauthenticated";
      default:
        return error.status === 429 ? "rate_limited" : "unknown";
    }
  })();
  return err(code, vendor);
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;

export function createAuthRepository(db: DbClient) {
  return {
    /** The verified user for this request's cookies, or null when signed out. */
    async getUser(): Promise<SessionUser | null> {
      const { data, error } = await db.auth.getUser();
      if (error) {
        // No or expired session is the normal signed-out state, not a failure.
        if (
          error.status === 400 ||
          error.status === 401 ||
          error.name === "AuthSessionMissingError"
        ) {
          return null;
        }
        throw error;
      }
      return data.user ? { id: data.user.id } : null;
    },

    async signUp(input: {
      email: string;
      password: string;
      displayName: string;
      emailRedirectTo: string;
    }): Promise<Result<{ needsConfirmation: boolean }, AuthFailure>> {
      const { data, error } = await db.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { full_name: input.displayName }, emailRedirectTo: input.emailRedirectTo },
      });
      if (error) return fail(error);
      return ok({ needsConfirmation: data.session === null });
    },

    async signInWithPassword(email: string, password: string): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.signInWithPassword({ email, password });
      return error ? fail(error) : ok(null);
    },

    async signOut(): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.signOut();
      return error ? fail(error) : ok(null);
    },

    /** Returns the provider URL to send the browser to; the PKCE verifier is stored in cookies. */
    async startOAuth(provider: "google", redirectTo: string): Promise<Result<string, AuthFailure>> {
      const { data, error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) return fail(error);
      return ok(data.url);
    },

    async requestPasswordReset(
      email: string,
      redirectTo: string,
    ): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      return error ? fail(error) : ok(null);
    },

    async updatePassword(password: string): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.updateUser({ password });
      return error ? fail(error) : ok(null);
    },

    async exchangeCode(code: string): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.exchangeCodeForSession(code);
      return error ? fail(error) : ok(null);
    },

    async verifyEmailOtp(
      tokenHash: string,
      type: EmailOtpType,
    ): Promise<Result<null, AuthFailure>> {
      const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
      return error ? fail(error) : ok(null);
    },
  };
}
