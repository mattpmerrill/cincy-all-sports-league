import { unstable_cache } from "next/cache";
import { LEAGUE_CACHE_TAG } from "@/lib/league-cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createLeagueRepository } from "./league.repository";

/**
 * The public league read model, shared by every page through Next's data cache and tagged so
 * `revalidateLeague()` can drop it. The 10-minute expiry is only a safety net if an invalidation
 * is ever missed. Uses the cookie-free anon client because cached functions can't read cookies.
 *
 * Why `unstable_cache` rather than `use cache`: `use cache` needs the cacheComponents rendering
 * model, which would reshape every existing auth page. This API is still supported in Next 16 and
 * covers the same tag semantics; migrate the day the app opts in to Cache Components.
 */
export const loadCachedLeagueData = unstable_cache(
  async () => createLeagueRepository(createSupabasePublicClient()).load(),
  // Bump the version when `LeagueData` changes shape: the data cache outlives a deploy, and the
  // new code would otherwise read old entries (no `banked`, no `baseline`, no banked `source`, no
  // `records`) for up to 10 minutes.
  ["league-data", "v4"],
  { tags: [LEAGUE_CACHE_TAG], revalidate: 600 },
);
