import { z } from "zod";

export const claimTeamSchema = z.object({
  teamId: z.uuid("Choose a team."),
});

export const reviewClaimSchema = z.object({
  claimId: z.uuid("That claim isn't valid."),
});

/** The `?team=` slug on the claim form link. Anything malformed just means "nothing picked". */
export const teamSlugParamSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
