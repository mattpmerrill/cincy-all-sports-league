import { unstable_cache } from "next/cache";
import { GAMES_CACHE_TAG } from "@/lib/games-cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createGamesRepository } from "./games.repository";

/**
 * A season's games between two instants, shared by every visitor through Next's data cache and
 * tagged so `revalidateGames()` drops it after a refresh writes. The five-minute expiry is only a
 * safety net for a missed invalidation. Arguments are strings (ISO instants), which `unstable_cache`
 * folds into the key, so each week the page is opened on gets its own entry; the schedule service
 * only asks for weeks inside the season, which bounds how many there can be.
 *
 * Uses the cookie-free anon client because cached functions can't read cookies. See
 * `league.cached.ts` for why this is `unstable_cache` and not `use cache`.
 */
export const loadCachedGames = unstable_cache(
  async (seasonId: string, fromIso: string, toIso: string) =>
    createGamesRepository(createSupabasePublicClient()).listBetween(
      seasonId,
      new Date(fromIso),
      new Date(toIso),
    ),
  // Bump the version if the cached shape (`Game`) changes.
  ["games-between", "v1"],
  { tags: [GAMES_CACHE_TAG], revalidate: 300 },
);
