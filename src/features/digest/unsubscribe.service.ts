import type { ProfilesRepository } from "@/data/profiles.repository";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { verifyUnsubscribeToken } from "./unsubscribe-token";

export type UnsubscribeErrorCode = "invalid_token" | "not_found";

export type UnsubscribeService = ReturnType<typeof createUnsubscribeService>;

type Repo = Pick<ProfilesRepository, "getWeeklyEmailOptIn" | "setWeeklyEmailOptIn">;

/**
 * Opt-in changes from an emailed link. There is no session, so the signed token is the whole
 * authorization, and the repository (on the secret-key client) is only ever called with the user
 * id taken out of a verified token.
 */
export function createUnsubscribeService(deps: { profiles: Repo; secret: string }) {
  const userIdFor = (token: string): string | null => verifyUnsubscribeToken(token, deps.secret);

  async function set(
    token: string,
    optIn: boolean,
  ): Promise<Result<{ optedIn: boolean }, AppError<UnsubscribeErrorCode>>> {
    const userId = userIdFor(token);
    if (!userId) return err("invalid_token", "This link is not valid.");
    const updated = await deps.profiles.setWeeklyEmailOptIn(userId, optIn);
    return updated ? ok({ optedIn: optIn }) : err("not_found", "We couldn't find that account.");
  }

  return {
    async status(
      token: string,
    ): Promise<Result<{ optedIn: boolean }, AppError<UnsubscribeErrorCode>>> {
      const userId = userIdFor(token);
      if (!userId) return err("invalid_token", "This link is not valid.");
      const optedIn = await deps.profiles.getWeeklyEmailOptIn(userId);
      return optedIn === null
        ? err("not_found", "We couldn't find that account.")
        : ok({ optedIn });
    },
    unsubscribe: (token: string) => set(token, false),
    resubscribe: (token: string) => set(token, true),
  };
}
