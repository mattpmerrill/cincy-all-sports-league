import type { Profile, ProfilesRepository } from "@/data/profiles.repository";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { Actor } from "@/domain/membership/membership";

export type ProfileService = ReturnType<typeof createProfileService>;

export function createProfileService(
  profiles: Pick<
    ProfilesRepository,
    | "updateDisplayName"
    | "getWeeklyEmailOptIn"
    | "setWeeklyEmailOptIn"
    | "getTradeEmailOptIn"
    | "setTradeEmailOptIn"
  >,
) {
  return {
    /** A member edits only their own name; the actor's id is the target, never a parameter. */
    async updateDisplayName(
      actor: Actor,
      displayName: string,
    ): Promise<Result<Profile, AppError<"not_found">>> {
      const updated = await profiles.updateDisplayName(actor.id, displayName);
      return updated ? ok(updated) : err("not_found", "We couldn't find your profile.");
    },

    /** True when the member gets the Monday digest. A missing profile reads as opted in (the default). */
    async getWeeklyEmail(actor: Actor): Promise<boolean> {
      return (await profiles.getWeeklyEmailOptIn(actor.id)) ?? true;
    },

    /** Own row only: the actor's id is the target, and RLS refuses anything else. */
    async setWeeklyEmail(
      actor: Actor,
      optIn: boolean,
    ): Promise<Result<{ optedIn: boolean }, AppError<"not_found">>> {
      const updated = await profiles.setWeeklyEmailOptIn(actor.id, optIn);
      return updated ? ok({ optedIn: optIn }) : err("not_found", "We couldn't find your profile.");
    },

    /** True when the member gets trade alert emails. A missing profile reads as opted in (the default). */
    async getTradeEmails(actor: Actor): Promise<boolean> {
      return (await profiles.getTradeEmailOptIn(actor.id)) ?? true;
    },

    /** Own row only: the actor's id is the target, and RLS refuses anything else. */
    async setTradeEmails(
      actor: Actor,
      optIn: boolean,
    ): Promise<Result<{ optedIn: boolean }, AppError<"not_found">>> {
      const updated = await profiles.setTradeEmailOptIn(actor.id, optIn);
      return updated ? ok({ optedIn: optIn }) : err("not_found", "We couldn't find your profile.");
    },
  };
}
