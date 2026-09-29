import type { AuthRepository } from "@/data/auth.repository";
import type { AvatarsRepository } from "@/data/avatars.repository";
import type { OptInColumn, Profile, ProfilesRepository } from "@/data/profiles.repository";
import type { Logger } from "@/lib/logger";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { Actor } from "@/domain/membership/membership";
import { AVATAR_MAX_BYTES, detectImageType } from "./avatar";

export type ProfileService = ReturnType<typeof createProfileService>;

export type ProfileServiceDeps = {
  profiles: Pick<
    ProfilesRepository,
    "updateDisplayName" | "getOptIn" | "setOptIn" | "setAvatarUrl"
  >;
  avatars: Pick<AvatarsRepository, "upload" | "removeAllExcept" | "isUploaded">;
  auth: Pick<AuthRepository, "getProviderAvatarUrl">;
  logger: Pick<Logger, "warn">;
};

/** Where the member's current photo came from, so /me can offer "Remove photo" only for uploads. */
export type AvatarSource = "upload" | "provider" | "none";

export type AvatarError = AppError<"not_found" | "invalid_image" | "too_large">;

export function createProfileService({ profiles, avatars, auth, logger }: ProfileServiceDeps) {
  /** Old files are housekeeping: a failure leaves an orphan behind, logged, never a failed save. */
  const cleanUp = (userId: string, keepUrl: string | null) =>
    avatars.removeAllExcept(userId, keepUrl).catch((error: unknown) => {
      logger.warn("avatar cleanup failed", { userId, error });
    });

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

  const notFound = () => err("not_found", "We couldn't find your profile.");

  return {
    /** A member edits only their own name; the actor's id is the target, never a parameter. */
    async updateDisplayName(
      actor: Actor,
      displayName: string,
    ): Promise<Result<Profile, AppError<"not_found">>> {
      const updated = await profiles.updateDisplayName(actor.id, displayName);
      return updated ? ok(updated) : notFound();
    },

    /** True when the member gets the Monday digest. */
    getWeeklyEmail: (actor: Actor) => getEmail(actor, "weekly_email_opt_in"),

    setWeeklyEmail: (actor: Actor, optIn: boolean) => setEmail(actor, "weekly_email_opt_in", optIn),

    /** True when the member gets trade alert emails. */
    getTradeEmails: (actor: Actor) => getEmail(actor, "trade_emails"),

    setTradeEmails: (actor: Actor, optIn: boolean) => setEmail(actor, "trade_emails", optIn),

    avatarSource(avatarUrl: string | null): AvatarSource {
      if (!avatarUrl) return "none";
      return avatars.isUploaded(avatarUrl) ? "upload" : "provider";
    },

    /**
     * Stores a new photo and points the profile at it. The file's own bytes decide its type (the
     * browser's label is not trusted). Older uploads are cleaned up afterwards.
     */
    async updateAvatar(actor: Actor, bytes: Uint8Array): Promise<Result<Profile, AvatarError>> {
      if (bytes.byteLength > AVATAR_MAX_BYTES) {
        return err("too_large", "That photo is too big. Try a smaller one.");
      }
      const type = detectImageType(bytes);
      if (!type)
        return err("invalid_image", "That file isn't a photo we can use. Try a JPG or PNG.");

      const url = await avatars.upload(
        actor.id,
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        type,
      );
      const updated = await profiles.setAvatarUrl(actor.id, url);
      if (!updated) {
        await cleanUp(actor.id, null);
        return notFound();
      }
      await cleanUp(actor.id, url);
      return ok(updated);
    },

    /** Drops an uploaded photo: back to the Google photo when there is one, else initials. */
    async removeAvatar(actor: Actor): Promise<Result<Profile, AppError<"not_found">>> {
      const fallback = await auth.getProviderAvatarUrl();
      const updated = await profiles.setAvatarUrl(actor.id, fallback);
      if (!updated) return notFound();
      await cleanUp(actor.id, null);
      return ok(updated);
    },
  };
}
