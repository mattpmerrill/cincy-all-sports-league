import type { EmailOtpType } from "@supabase/supabase-js";
import type { AuthFailure, AuthRepository } from "@/data/auth.repository";
import type { Profile, ProfilesRepository } from "@/data/profiles.repository";
import { isAdminRole } from "@/domain/membership/membership";
import type { Logger } from "@/lib/logger";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { toAuthError, type AuthAppError } from "./messages";
import { safeNextPath } from "./safe-next";

/** The signed-in member, as loaded from the database (never from the client). */
export type AuthedUser = Profile;

export type UnauthenticatedError = AppError<"unauthenticated">;
export type ForbiddenError = AppError<"unauthenticated" | "forbidden">;

export type AuthServiceDeps = {
  auth: AuthRepository;
  profiles: ProfilesRepository;
  logger: Logger;
};

export type CallbackCredentials =
  { kind: "code"; code: string } | { kind: "token_hash"; tokenHash: string; type: EmailOtpType };

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService({ auth, profiles, logger }: AuthServiceDeps) {
  /** Maps a repository failure to friendly copy, logging the vendor detail for unknowns only. */
  function failure(op: string, error: AuthFailure) {
    if (error.code === "unknown") {
      logger.error("auth operation failed", { op, vendorCode: error.message });
    }
    return toAuthError(error);
  }

  const callbackUrl = (origin: string, next: string) =>
    `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;

  async function currentUser(): Promise<AuthedUser | null> {
    const session = await auth.getUser();
    if (!session) return null;
    const profile = await profiles.getById(session.id);
    // The sign-up trigger creates the profile in the same transaction as the auth user, so a
    // signed-in user without one is a data fault worth failing loudly on.
    if (!profile) throw new Error("Signed-in user has no profile row");
    return profile;
  }

  return {
    async signUp(
      input: { displayName: string; email: string; password: string },
      origin: string,
      next: string,
    ): Promise<Result<{ needsConfirmation: boolean }, AuthAppError>> {
      const result = await auth.signUp({ ...input, emailRedirectTo: callbackUrl(origin, next) });
      return result.ok ? result : failure("signUp", result.error);
    },

    async signIn(email: string, password: string): Promise<Result<null, AuthAppError>> {
      const result = await auth.signInWithPassword(email, password);
      return result.ok ? result : failure("signIn", result.error);
    },

    async signOut(): Promise<Result<null, AuthAppError>> {
      const result = await auth.signOut();
      return result.ok ? result : failure("signOut", result.error);
    },

    async startGoogleSignIn(origin: string, next: string): Promise<Result<string, AuthAppError>> {
      const result = await auth.startOAuth("google", callbackUrl(origin, next));
      return result.ok ? result : failure("startGoogleSignIn", result.error);
    },

    async requestPasswordReset(email: string, origin: string): Promise<Result<null, AuthAppError>> {
      const result = await auth.requestPasswordReset(
        email,
        callbackUrl(origin, "/reset-password/update"),
      );
      return result.ok ? result : failure("requestPasswordReset", result.error);
    },

    async updatePassword(password: string): Promise<Result<null, AuthAppError>> {
      const result = await auth.updatePassword(password);
      return result.ok ? result : failure("updatePassword", result.error);
    },

    /** Completes an email-link or OAuth round trip, leaving the session in cookies. */
    async completeCallback(credentials: CallbackCredentials): Promise<Result<null, AuthAppError>> {
      const result =
        credentials.kind === "code"
          ? await auth.exchangeCode(credentials.code)
          : await auth.verifyEmailOtp(credentials.tokenHash, credentials.type);
      return result.ok ? result : failure("completeCallback", result.error);
    },

    getCurrentUser: currentUser,

    /** Authentication for actions and pages: who is calling, from the verified session. */
    async requireUser(): Promise<Result<AuthedUser, UnauthenticatedError>> {
      const user = await currentUser();
      return user ? ok(user) : err("unauthenticated", "Sign in to continue.");
    },

    async requireAdmin(): Promise<Result<AuthedUser, ForbiddenError>> {
      const user = await currentUser();
      if (!user) return err("unauthenticated", "Sign in to continue.");
      if (!isAdminRole(user.role)) return err("forbidden", "Only admins can do that.");
      return ok(user);
    },
  };
}
