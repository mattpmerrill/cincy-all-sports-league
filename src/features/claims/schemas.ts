import { z } from "zod";

export const claimTeamSchema = z.object({
  teamId: z.uuid("Choose a team."),
});

export const reviewClaimSchema = z.object({
  claimId: z.uuid("That claim isn't valid."),
});
