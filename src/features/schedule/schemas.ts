import { z } from "zod";
import { isWeekStart } from "@/domain/calendar";

const TEAM_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The Week page's query string. Neither parameter is worth an error page: a stale bookmark or a
 * hand-edited URL just falls back (to the current week, to all teams), so each field catches its
 * own failure. `week` must be a real Monday; anything else, including a repeated parameter, is
 * ignored rather than guessed at.
 */
export const weekSearchSchema = z.object({
  week: z.string().refine(isWeekStart).optional().catch(undefined),
  team: z.string().max(80).regex(TEAM_SLUG).optional().catch(undefined),
});

export type WeekSearch = z.output<typeof weekSearchSchema>;

/**
 * How far back and forward a games refresh looks. `live` re-reads yesterday and today (scores and
 * status); `weeks` loads this week and next (schedules, rescheduled kickoffs).
 */
export const GAMES_RANGES = ["live", "weeks"] as const;
export const gamesRangeSchema = z.enum(GAMES_RANGES);
export type GamesRange = z.output<typeof gamesRangeSchema>;
