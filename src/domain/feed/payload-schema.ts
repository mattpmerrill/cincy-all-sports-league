import { z } from "zod";
import { isWeekStart } from "@/domain/calendar";
import { SPORT_CODES } from "@/domain/sports/sports";
import { MATCHUPS_WEEK_OUTCOMES, OFFER_KINDS } from "./types";
import type { LeaguePayload } from "./types";

const teamLink = z.object({ name: z.string(), slug: z.string() });

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
  z.object({
    type: z.literal("trade_listed"),
    listingId: z.string(),
    team: teamLink,
    items: z.array(z.object({ sport: z.enum(SPORT_CODES), participantName: z.string() })),
  }),
  z.object({
    type: z.literal("trade_offer"),
    listingId: z.string(),
    offerKind: z.enum(OFFER_KINDS),
    from: teamLink,
    to: teamLink,
    legs: z.array(z.object({ sport: z.enum(SPORT_CODES), gives: z.string(), gets: z.string() })),
    note: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("free_agent_move"),
    moveId: z.string(),
    team: teamLink,
    sport: z.enum(SPORT_CODES),
    dropped: z.string(),
    added: z.string(),
  }),
  z.object({
    type: z.literal("matchups_week"),
    weekStart: z.string().refine(isWeekStart, "A week starts on a Monday."),
    results: z.array(
      z.object({
        home: teamLink,
        away: teamLink,
        homeGain: z.number(),
        awayGain: z.number(),
        outcome: z.enum(MATCHUPS_WEEK_OUTCOMES),
      }),
    ),
    pairings: z.array(z.object({ home: teamLink, away: teamLink })),
  }),
  z.object({
    type: z.literal("trade_completed"),
    listingId: z.string(),
    owner: teamLink,
    offerer: teamLink,
    legs: z.array(
      z.object({ sport: z.enum(SPORT_CODES), ownerGave: z.string(), offererGave: z.string() }),
    ),
  }),
]);

/** The jsonb column is untyped, so league payloads are validated on the way out. Unknown shapes
 * (an older or newer post type) become null and the card falls back to the plain body text. */
export function parseLeaguePayload(value: unknown): LeaguePayload | null {
  const parsed = leaguePayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
