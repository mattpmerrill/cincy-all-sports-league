import { z } from "zod";
import { displayNameSchema } from "@/domain/membership/display-name";

export const updateDisplayNameSchema = z.object({ displayName: displayNameSchema });

export const weeklyEmailSchema = z.object({ optIn: z.enum(["true", "false"]) });

export const tradeEmailsSchema = z.object({ optIn: z.enum(["true", "false"]) });
