import { z } from "zod";

export const STANDINGS_VIEWS = ["season", "matchups"] as const;
export type StandingsView = (typeof STANDINGS_VIEWS)[number];

/**
 * The Standings page's query string. `view` picks the season table (default) or the matchup
 * table. Anything else, including a repeated parameter, falls back to the season table: a stale
 * link should still land on the page people expect.
 */
export const standingsSearchSchema = z.object({
  view: z.enum(STANDINGS_VIEWS).catch("season"),
});
