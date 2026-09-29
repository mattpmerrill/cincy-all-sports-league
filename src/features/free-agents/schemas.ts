import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";

/**
 * Both ids must be uuids before anything reaches the repository: PostgREST rejects a malformed one
 * with a cast error (22P02), which would surface as a crash instead of a form message.
 */
export const makeMoveSchema = z
  .object({
    sport: z.enum(SPORT_CODES, "Pick a valid sport."),
    dropParticipantId: z.uuid("That player isn't valid."),
    addParticipantId: z.uuid("That player isn't valid."),
  })
  .refine((move) => move.dropParticipantId !== move.addParticipantId, {
    message: "That's already your pick.",
    path: ["addParticipantId"],
  });

/** The `[sport]` route segment. Anything else means "no such sport". */
export const sportParamSchema = z.enum(SPORT_CODES);
