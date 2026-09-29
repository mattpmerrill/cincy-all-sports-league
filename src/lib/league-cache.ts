import { revalidateTag } from "next/cache";

/** Tag carried by every cached league read (see data/league.cached.ts). */
export const LEAGUE_CACHE_TAG = "league";

/**
 * Drop the cached league read model. The sync service and the admin results editor call this
 * after writing facts, so public pages show new results on the next request.
 *
 * `expire: 0` means no stale serving: the next visitor waits for a fresh read instead of seeing
 * old standings, which matters right after an admin correction. Call it from a Route Handler or
 * Server Action only (Next forbids it during render).
 */
export function revalidateLeague(): void {
  revalidateTag(LEAGUE_CACHE_TAG, { expire: 0 });
}
