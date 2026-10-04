import { unstable_cache } from "next/cache";
import { MATCHUPS_CACHE_TAG } from "@/lib/matchups-cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createMatchupsRepository } from "./matchups.repository";

/**
 * A season's matchups, shared by every visitor through Next's data cache and tagged so
 * `revalidateMatchups()` drops it after the Monday rollover writes. Matchups only change at that
 * rollover, so the one-hour expiry is just a safety net for a missed invalidation. The season id
 * is an argument, which `unstable_cache` folds into the key. It holds the whole season (about ten
 * rows a week), and live scores are not in it: they come from the league model, which has its own
 * cache, so a sync never needs to drop this one.
 *
 * Uses the cookie-free anon client because cached functions can't read cookies. See
 * `league.cached.ts` for why this is `unstable_cache` and not `use cache`.
 */
export const loadCachedMatchups = unstable_cache(
  async (seasonId: string) =>
    createMatchupsRepository(createSupabasePublicClient()).listSeason(seasonId),
  // Bump the version if the cached shape (`Matchup`) changes: the data cache outlives a deploy,
  // and new code would otherwise read old entries until the safety-net expiry.
  ["matchups-season", "v1"],
  { tags: [MATCHUPS_CACHE_TAG], revalidate: 3600 },
);
