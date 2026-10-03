import "server-only";
import { loadCachedGames } from "@/data/games.cached";
import { createGamesRepository } from "@/data/games.repository";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createSportTargetsRepository } from "@/data/sport-targets.repository";
import { fetchScheduledGames } from "@/integrations/espn";
import { revalidateGames } from "@/lib/games-cache";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGamesSyncService } from "./games-sync.service";
import { createScheduleService, type TeamWeek } from "./schedule.service";

/** The read side: the cached league (picks, season dates) plus the cached games. No cookies. */
export const getScheduleService = () =>
  createScheduleService({ league: loadCachedLeagueData, games: loadCachedGames });

/**
 * A team's week for the team page, which must still render when the schedule cannot be read: the
 * panel is secondary, the picks are the page. A failure is logged and the section is left out.
 */
export async function getTeamWeekOrNull(slug: string): Promise<TeamWeek | null> {
  try {
    return await getScheduleService().getTeamWeek(slug);
  } catch (error) {
    logger.error("team week unavailable", { scope: "schedule", error });
    return null;
  }
}

/**
 * The games refresh on the secret-key client, which bypasses RLS by design (the games table has no
 * write policy for anyone else). The caller must have authorized the request first: the cron
 * route checks CRON_SECRET.
 */
export function getGamesSyncService() {
  const db = createSupabaseAdminClient();
  return createGamesSyncService({
    targets: createSportTargetsRepository(db),
    games: createGamesRepository(db),
    fetchGames: fetchScheduledGames,
    invalidate: revalidateGames,
    logger: logger.child({ scope: "games" }),
    newCorrelationId,
  });
}
