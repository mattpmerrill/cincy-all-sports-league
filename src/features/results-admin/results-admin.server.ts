import "server-only";
import { createParticipantResultsRepository } from "@/data/participant-results.repository";
import { createSportTargetsRepository } from "@/data/sport-targets.repository";
import { createSyncRunsRepository } from "@/data/sync-runs.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createResultsAdminService } from "./results-admin.service";

/** Acts as the signed-in admin, so RLS admits the writes and marks them manual. */
export async function getResultsAdminService() {
  const db = await createSupabaseServerClient();
  return createResultsAdminService({
    targets: createSportTargetsRepository(db),
    results: createParticipantResultsRepository(db),
    runs: createSyncRunsRepository(db),
  });
}
