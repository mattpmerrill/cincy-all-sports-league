import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";
import type { LeaguePayload } from "./types";

const leaguePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("score_update"),
    items: z.array(
      z.object({
        teamSlug: z.string(),
        teamName: z.string(),
        participantName: z.string(),
        sport: z.enum(SPORT_CODES),
        pointsDelta: z.number(),
      }),
    ),
  }),
  z.object({
    type: z.literal("movers"),
    date: z.string().nullable().default(null),
    items: z.array(
      z.object({
        teamSlug: z.string(),
        teamName: z.string(),
        direction: z.enum(["up", "down"]),
        places: z.number(),
        rank: z.number(),
        rankLabel: z.string(),
      }),
    ),
  }),
]);

/** The jsonb column is untyped, so league payloads are validated on the way out. Unknown shapes
 * (an older or newer post type) become null and the card falls back to the plain body text. */
export function parseLeaguePayload(value: unknown): LeaguePayload | null {
  const parsed = leaguePayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
