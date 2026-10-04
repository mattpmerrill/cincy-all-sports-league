import { revalidateTag } from "next/cache";

/** Tag carried by every cached matchups read (see data/matchups.cached.ts). */
export const MATCHUPS_CACHE_TAG = "matchups";

/**
 * Drop the cached matchups. The Monday rollover calls this after it writes, so the Week page shows
 * the new pairings (and last week's final results) on the next request instead of waiting out the
 * safety-net expiry. Like `revalidateGames`, `expire: 0` means the next visitor waits for a fresh
 * read rather than being served last week's rows, and it may only be called from a Route Handler
 * or Server Action.
 */
export function revalidateMatchups(): void {
  revalidateTag(MATCHUPS_CACHE_TAG, { expire: 0 });
}
