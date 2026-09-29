import type { Profile, ProfilesRepository } from "@/data/profiles.repository";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { Actor } from "@/domain/membership/membership";

export type ProfileService = ReturnType<typeof createProfileService>;

export function createProfileService(profiles: Pick<ProfilesRepository, "updateDisplayName">) {
  return {
    /** A member edits only their own name; the actor's id is the target, never a parameter. */
    async updateDisplayName(
      actor: Actor,
      displayName: string,
    ): Promise<Result<Profile, AppError<"not_found">>> {
      const updated = await profiles.updateDisplayName(actor.id, displayName);
      return updated ? ok(updated) : err("not_found", "We couldn't find your profile.");
    },
  };
}
