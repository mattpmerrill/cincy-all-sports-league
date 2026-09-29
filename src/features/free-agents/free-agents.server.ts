import "server-only";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { loadCachedPool } from "@/data/free-agents.cached";
import { createFreeAgentsRepository } from "@/data/free-agents.repository";
import { loadCachedLeagueData } from "@/data/league.cached";
import { createLeagueRepository } from "@/data/league.repository";
import { createTradesRepository } from "@/data/trades.repository";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createFreeAgentsService } from "./free-agents.service";
import type { FreeAgentsService, RefreshFacts } from "./free-agents.service";

async function build(refreshFacts: RefreshFacts) {
  const session = await createSupabaseServerClient();
  return createFreeAgentsService({
    loadCachedData: loadCachedLeagueData,
    loadFreshData: () => createLeagueRepository(session).load(),
    pool: { list: loadCachedPool },
    repo: createFreeAgentsRepository(session),
    mutations: () => createFreeAgentsRepository(createSupabaseAdminClient()),
    teams: createFantasyTeamsRepository(session),
    trades: createTradesRepository(session),
    refreshFacts,
    now: () => new Date(),
    logger: logger.child({ scope: "free-agents" }),
  });
}

/**
 * The free-agents service, able to make moves. Reads and the fresh league load run as the visitor
 * (RLS applies; the tables are publicly readable). The move runs on the secret-key client because
 * `make_free_agent_move` is service_role only, so callers must have authenticated the user first
 * (ADR-004): a Server Action re-checks the session, then passes the actor.
 *
 * `refreshFacts` is supplied by the caller because this feature must not import the sync feature;
 * the action composes the two (see `app/free-agents/actions.ts`).
 */
export const getFreeAgentsService = ({ refreshFacts }: { refreshFacts: RefreshFacts }) =>
  build(refreshFacts);

/**
 * For pages, which only read. The type hides `makeMove`, so the compiler stops a page from
 * calling it; the refresher is unreachable and throws if that ever changes.
 */
export async function getFreeAgentsReader(): Promise<
  Pick<FreeAgentsService, "getHub" | "getSportBoard">
> {
  return build(() => {
    throw new Error("reader cannot make moves");
  });
}
