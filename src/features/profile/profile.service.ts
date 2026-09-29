import type { OptInColumn, Profile, ProfilesRepository } from "@/data/profiles.repository";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { Actor } from "@/domain/membership/membership";

export type ProfileService = ReturnType<typeof createProfileService>;

export function createProfileService(
  profiles: Pick<ProfilesRepository, "updateDisplayName" | "getOptIn" | "setOptIn">,
) {
  /** A missing profile reads as opted in (the default); own row only, RLS refuses anything else. */
  const getEmail = async (actor: Actor, column: OptInColumn): Promise<boolean> =>
    (await profiles.getOptIn(actor.id, column)) ?? true;

  const setEmail = async (
    actor: Actor,
    column: OptInColumn,
    optIn: boolean,
  ): Promise<Result<{ optedIn: boolean }, AppError<"not_found">>> => {
    const updated = await profiles.setOptIn(actor.id, column, optIn);
    return updated ? ok({ optedIn: optIn }) : err("not_found", "We couldn't find your profile.");
  };

  return {
    /** A member edits only their own name; the actor's id is the target, never a parameter. */
    async updateDisplayName(
      actor: Actor,
      displayName: string,
    ): Promise<Result<Profile, AppError<"not_found">>> {
      const updated = await profiles.updateDisplayName(actor.id, displayName);
      return updated ? ok(updated) : err("not_found", "We couldn't find your profile.");
    },

    /** True when the member gets the Monday digest. */
    getWeeklyEmail: (actor: Actor) => getEmail(actor, "weekly_email_opt_in"),

    setWeeklyEmail: (actor: Actor, optIn: boolean) => setEmail(actor, "weekly_email_opt_in", optIn),

    /** True when the member gets trade alert emails. */
    getTradeEmails: (actor: Actor) => getEmail(actor, "trade_emails"),

    setTradeEmails: (actor: Actor, optIn: boolean) => setEmail(actor, "trade_emails", optIn),
  };
}
