import "server-only";
import { after } from "next/server";
import { createMessagesRepository } from "@/data/messages.repository";
import { createLeagueRepository } from "@/data/league.repository";
import { createParticipantRecordsRepository } from "@/data/participant-records.repository";
import { createParticipantResultsRepository } from "@/data/participant-results.repository";
import { createParticipantsRepository } from "@/data/participants.repository";
import { createPushRepository } from "@/data/push.repository";
import { createSportTargetsRepository } from "@/data/sport-targets.repository";
import { createStandingsSnapshotsRepository } from "@/data/standings-snapshots.repository";
import { createSyncRunsRepository } from "@/data/sync-runs.repository";
import type { EspnClientOptions } from "@/integrations/espn";
import { createPushDelivery, createPushNotifier } from "@/integrations/webpush";
import { pushConfig } from "@/lib/env.server";
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
  const log = logger.child({ scope: "sync" });
  return createSyncService({
    provider: createEspnResultsProvider(options.espn),
    directory: createEspnDirectoryProvider(options.espn),
    participants: createParticipantsRepository(db),
    targets: createSportTargetsRepository(db),
    results: createParticipantResultsRepository(db),
    records: createParticipantRecordsRepository(db),
    runs: createSyncRunsRepository(db),
    snapshots: createStandingsSnapshotsRepository(db),
    league: createLeagueRepository(db),
    posts: {
      write: (seasonId, post) => messages.insertLeague(seasonId, post.body, post.payload),
      hasMoversPost: (seasonId, date) => messages.hasLeaguePost(seasonId, "movers", date),
    },
    invalidate: revalidateLeague,
    // `after()` is allowed in Route Handlers (the cron route) and Server Functions (admin "Sync
    // now"), the only two callers of `syncLeague`. The delivery is built inside the task, so push
    // secrets are read after the response.
    notifier: createPushNotifier({
      schedule: after,
      delivery: () =>
        createPushDelivery({
          store: createPushRepository(db),
          config: pushConfig(),
          logger: log,
          newCorrelationId,
        }),
      logger: log,
    }),
    logger: log,
    newCorrelationId,
  });
}
