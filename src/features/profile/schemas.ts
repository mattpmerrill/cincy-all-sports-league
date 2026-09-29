import { z } from "zod";
import { displayNameSchema } from "@/domain/membership/display-name";
import { AVATAR_MAX_BYTES } from "./avatar";

export const updateDisplayNameSchema = z.object({ displayName: displayNameSchema });

/** The weekly-digest and trade-alert switches on /me post the same single field. */
export const emailOptInSchema = z.object({ optIn: z.enum(["true", "false"]) });

/**
 * The photo field on /me. Only the transport is checked here (a non-empty file under the cap); the
 * service decides whether the bytes are really an image.
 */
export const avatarUploadSchema = z.object({
  avatar: z
    .instanceof(File, { message: "Choose a photo first." })
    .refine((file) => file.size > 0, "Choose a photo first.")
    .refine((file) => file.size <= AVATAR_MAX_BYTES, "That photo is too big. Try a smaller one."),
});
