import { revalidateTag } from "next/cache";

/** Tag carried by every cached games read (see data/games.cached.ts). */
export const GAMES_CACHE_TAG = "games";

/**
 * Drop the cached games. The games refresh calls this after it writes, so the Week page shows a
 * new score on the next request instead of waiting out the safety-net expiry. Like
 * `revalidateLeague`, `expire: 0` means the next visitor waits for a fresh read rather than
 * being served old scores, and it may only be called from a Route Handler or Server Action.
 */
export function revalidateGames(): void {
  revalidateTag(GAMES_CACHE_TAG, { expire: 0 });
}
