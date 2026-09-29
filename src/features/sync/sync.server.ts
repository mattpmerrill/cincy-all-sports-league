import "server-only";
import { createMessagesRepository } from "@/data/messages.repository";
import { createLeagueRepository } from "@/data/league.repository";
import { createParticipantResultsRepository } from "@/data/participant-results.repository";
import { createParticipantsRepository } from "@/data/participants.repository";
import { createSportTargetsRepository } from "@/data/sport-targets.repository";
import { createStandingsSnapshotsRepository } from "@/data/standings-snapshots.repository";
import { createSyncRunsRepository } from "@/data/sync-runs.repository";
import type { EspnClientOptions } from "@/integrations/espn";
import { revalidateLeague } from "@/lib/league-cache";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEspnDirectoryProvider } from "./espn-directory-provider";
import { createEspnResultsProvider } from "./espn-results-provider";
import { createSyncService } from "./sync.service";

/**
 * The sync service on the secret-key client, which bypasses RLS by design. Callers must have
 * authorized the request first: the cron route checks CRON_SECRET, the admin action requireAdmin.
 * `espn` tightens the ESPN client (timeout, attempts) for callers with a user waiting on the
 * response, such as a free-agent move.
 */
export function getSyncService(options: { espn?: EspnClientOptions } = {}) {
  const db = createSupabaseAdminClient();
  const messages = createMessagesRepository(db);
  return createSyncService({
    provider: createEspnResultsProvider(options.espn),
    directory: createEspnDirectoryProvider(options.espn),
    participants: createParticipantsRepository(db),
    targets: createSportTargetsRepository(db),
    results: createParticipantResultsRepository(db),
    runs: createSyncRunsRepository(db),
    snapshots: createStandingsSnapshotsRepository(db),
    league: createLeagueRepository(db),
    posts: {
      write: (seasonId, post) => messages.insertLeague(seasonId, post.body, post.payload),
      hasMoversPost: (seasonId, date) => messages.hasLeaguePost(seasonId, "movers", date),
    },
    invalidate: revalidateLeague,
    logger: logger.child({ scope: "sync" }),
    newCorrelationId,
  });
}
