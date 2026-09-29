import { unstable_cache } from "next/cache";
import type { SportCode } from "@/domain/sports/sports";
import { LEAGUE_CACHE_TAG } from "@/lib/league-cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createFreeAgentsRepository } from "./free-agents.repository";

/**
 * A sport's whole participant pool (up to a few hundred rows), shared by every visitor through
 * Next's data cache. It carries the league tag so the daily roster load can drop it when it adds
 * participants; the 10-minute expiry is only a safety net. The pool holds every participant, not
 * just free agents, so it does not change when a move happens; who is free is derived per request
 * from the league model. Uses the cookie-free anon client because cached functions can't read
 * cookies. See `league.cached.ts` for why this is `unstable_cache` and not `use cache`.
 *
 * The sport argument is part of the cache key automatically.
 */
export const loadCachedPool = unstable_cache(
  async (sport: SportCode) =>
    createFreeAgentsRepository(createSupabasePublicClient()).listPool(sport),
  // Bump the version if the cached shape (`ParticipantData`) changes.
  ["free-agent-pool", "v1"],
  { tags: [LEAGUE_CACHE_TAG], revalidate: 600 },
);
