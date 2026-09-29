import { z } from "zod";
import { displayNameSchema } from "@/domain/membership/display-name";

export const updateDisplayNameSchema = z.object({ displayName: displayNameSchema });

/** The weekly-digest and trade-alert switches on /me post the same single field. */
export const emailOptInSchema = z.object({ optIn: z.enum(["true", "false"]) });
