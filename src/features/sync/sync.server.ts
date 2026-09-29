import "server-only";
import { createLeagueRepository } from "@/data/league.repository";
import { createParticipantResultsRepository } from "@/data/participant-results.repository";
import { createSportTargetsRepository } from "@/data/sport-targets.repository";
import { createStandingsSnapshotsRepository } from "@/data/standings-snapshots.repository";
import { createSyncRunsRepository } from "@/data/sync-runs.repository";
import { revalidateLeague } from "@/lib/league-cache";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEspnResultsProvider } from "./espn-results-provider";
import { createSyncService } from "./sync.service";

/**
 * The sync service on the secret-key client, which bypasses RLS by design. Callers must have
 * authorized the request first: the cron route checks CRON_SECRET, the admin action requireAdmin.
 */
export function getSyncService() {
  const db = createSupabaseAdminClient();
  return createSyncService({
    provider: createEspnResultsProvider(),
    targets: createSportTargetsRepository(db),
    results: createParticipantResultsRepository(db),
    runs: createSyncRunsRepository(db),
    snapshots: createStandingsSnapshotsRepository(db),
    league: createLeagueRepository(db),
    invalidate: revalidateLeague,
    logger: logger.child({ scope: "sync" }),
    newCorrelationId,
  });
}
