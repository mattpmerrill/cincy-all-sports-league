import "server-only";
import { createLeagueRepository } from "@/data/league.repository";
import { loadCachedLeagueData } from "@/data/league.cached";
import { loadCachedMatchups } from "@/data/matchups.cached";
import { createMatchupsRepository } from "@/data/matchups.repository";
import { createMessagesRepository } from "@/data/messages.repository";
import { revalidateLeague } from "@/lib/league-cache";
import { revalidateMatchups } from "@/lib/matchups-cache";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createMatchupsRolloverService } from "./matchups-rollover.service";
import { createMatchupsService } from "./matchups.service";

/** The read side: the cached league (teams, totals, season dates) plus the cached matchups. No cookies. */
export const getMatchupsService = () =>
  createMatchupsService({ league: loadCachedLeagueData, matchups: loadCachedMatchups });

/**
 * The Monday rollover on the secret-key client, which bypasses RLS by design (only `service_role`
 * may run `roll_matchup_week` or write league posts). The league is read fresh, never from the
 * cache, because the totals it freezes must be current. The caller must have authorized the
 * request first: the cron route checks CRON_SECRET.
 */
export function getMatchupsRolloverService() {
  const db = createSupabaseAdminClient();
  const messages = createMessagesRepository(db);
  return createMatchupsRolloverService({
    league: { loadFresh: () => createLeagueRepository(db).load() },
    matchups: createMatchupsRepository(db),
    posts: { write: (seasonId, post) => messages.insertLeague(seasonId, post.body, post.payload) },
    revalidate: revalidateMatchups,
    invalidateLeague: revalidateLeague,
    logger: logger.child({ scope: "matchups" }),
    newCorrelationId,
  });
}
