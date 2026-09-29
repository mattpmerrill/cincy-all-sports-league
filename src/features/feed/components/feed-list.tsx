import type { Actor } from "@/domain/membership/membership";
import type { FeedActions } from "../feed-actions";
import { getFeedService } from "../feed.server";
import { RealtimeFeed } from "./realtime-feed";

/**
 * Server-rendered first page of the feed, handed to the live client component. Reads are public;
 * whether the viewer may post is decided here, from the database, never from the client.
 */
export async function FeedList({ user, actions }: { user: Actor | null; actions: FeedActions }) {
  const feed = await getFeedService();
  const [page, canPost] = await Promise.all([
    feed.getPage(),
    user ? feed.canPost(user.id) : Promise.resolve(false),
  ]);
  return (
    <RealtimeFeed
      initial={page}
      viewer={user ? { id: user.id, role: user.role } : null}
      canPost={canPost}
      serverNow={new Date().toISOString()}
      actions={actions}
    />
  );
}
