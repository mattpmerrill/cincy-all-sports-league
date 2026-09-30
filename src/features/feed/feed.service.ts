import type { FantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import type { MessagesRepository } from "@/data/messages.repository";
import type { ReactionsRepository } from "@/data/reactions.repository";
import type { Message, ReactionName, ReactionRow } from "@/domain/feed";
import { isAdminRole, type Actor } from "@/domain/membership/membership";
import { reactionPushAlert, replyPushAlert, type PushNotifier } from "@/domain/push";
import type { Logger } from "@/lib/logger";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type FeedDeps = {
  messages: Pick<
    MessagesRepository,
    "getActiveSeasonId" | "getById" | "listPage" | "insertMember" | "softDelete"
  >;
  reactions: Pick<ReactionsRepository, "listForMessages" | "add" | "remove">;
  teams: Pick<FantasyTeamsRepository, "getOwnedBy">;
  /** Push alerts for replies and reactions. Runs after the response and never changes a result. */
  notifier: PushNotifier;
  logger: Logger;
  now?: () => Date;
};

/** Who writes or reacts: the name goes into the alert other members read. */
export type FeedActor = Actor & { displayName: string };

export type FeedError = AppError<"rate_limited" | "not_allowed" | "not_found" | "invalid">;

export type FeedPage = { messages: Message[]; reactions: ReactionRow[]; hasMore: boolean };

/** Top-level messages per page. Replies come with their parents, so a page can hold more rows. */
export const FEED_PAGE_SIZE = 20;

const NOT_OWNER = "Claim a team and get it approved to join the conversation.";

export type FeedService = ReturnType<typeof createFeedService>;

export function createFeedService({
  messages,
  reactions,
  teams,
  notifier,
  logger,
  now = () => new Date(),
}: FeedDeps) {
  /**
   * Alerts go out after the response, so a notifier problem is logged and dropped: a message that
   * was posted or a reaction that was saved is never undone by an alert failure.
   */
  function notify(build: Parameters<PushNotifier["notify"]>[0]) {
    try {
      notifier.notify(build);
    } catch (error) {
      logger.error("could not schedule feed push alerts", { error });
    }
  }

  /** Posting rights: an approved team in the active season. RLS enforces the same rule. */
  async function canPost(userId: string): Promise<boolean> {
    return (await teams.getOwnedBy(userId)) !== null;
  }

  async function requireSeason(): Promise<Result<string, FeedError>> {
    const id = await messages.getActiveSeasonId();
    return id ? ok(id) : err("not_found", "There's no active season yet.");
  }

  async function write(
    actor: FeedActor,
    body: string,
    parentId: string | null,
  ): Promise<Result<Message, FeedError>> {
    if (!(await canPost(actor.id))) return err("not_allowed", NOT_OWNER);
    const season = await requireSeason();
    if (!season.ok) return season;

    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = await messages.getById(parentId);
      if (!parent || parent.deleted) return err("not_found", "That message no longer exists.");
      if (parent.parentId) return err("invalid", "You can't reply to a reply.");
      parentAuthorId = parent.author?.id ?? null;
    }
    const inserted = await messages.insertMember({
      seasonId: season.value,
      authorId: actor.id,
      body,
      parentId,
    });
    if (inserted.ok && parentId) {
      const reply = inserted.value;
      // The builder returns null for a league post (no author) and for a reply to yourself.
      notify(() =>
        [
          replyPushAlert({
            actorId: actor.id,
            replyId: reply.id,
            parent: { id: parentId, authorId: parentAuthorId },
            replierName: actor.displayName,
            replyBody: reply.body,
          }),
        ].filter((alert) => alert !== null),
      );
    }
    return inserted;
  }

  return {
    canPost,

    /** A page of the feed for anyone, signed in or not. `before` is the oldest createdAt shown. */
    async getPage(before?: string): Promise<FeedPage> {
      const season = await messages.getActiveSeasonId();
      if (!season) return { messages: [], reactions: [], hasMore: false };
      const page = await messages.listPage(season, { limit: FEED_PAGE_SIZE, before });
      return {
        messages: page.messages,
        reactions: await reactions.listForMessages(page.messages.map((m) => m.id)),
        hasMore: page.hasMore,
      };
    },

    /** The newest few top-level, un-removed messages for the leaderboard card. */
    async getLatest(limit: number): Promise<Message[]> {
      const season = await messages.getActiveSeasonId();
      if (!season) return [];
      // Over-fetch a little: removed messages are filtered out after the read.
      const page = await messages.listPage(season, { limit: limit + 3, withReplies: false });
      return page.messages.filter((m) => !m.deleted).slice(0, limit);
    },

    getMessage: (id: string) => messages.getById(id),

    post: (actor: FeedActor, body: string) => write(actor, body, null),
    reply: (actor: FeedActor, parentId: string, body: string) => write(actor, body, parentId),

    async setReaction(
      actor: FeedActor,
      messageId: string,
      emoji: ReactionName,
      on: boolean,
    ): Promise<Result<null, FeedError>> {
      const row = { messageId, userId: actor.id, emoji };
      // Undoing your own reaction never needs a team, so an owner who lost theirs is not stuck.
      if (!on) return reactions.remove(row);
      if (!(await canPost(actor.id))) return err("not_allowed", NOT_OWNER);
      const added = await reactions.add(row);
      if (added.ok) {
        // Both reads wait for the deferred build: the action's response never pays for them, and
        // a failing read is the notifier's to log, not this action's to report.
        notify(async () => {
          const message = await messages.getById(messageId);
          if (!message) return [];
          const everyReaction = await reactions.listForMessages([messageId]);
          const alert = reactionPushAlert({
            actorId: actor.id,
            actorName: actor.displayName,
            reaction: emoji,
            message: {
              id: message.id,
              authorId: message.author?.id ?? null,
              body: message.body,
              deleted: message.deleted,
            },
            reactorIds: everyReaction.map((r) => r.userId),
          });
          return alert ? [alert] : [];
        });
      }
      return added;
    },

    /** Authors remove their own messages; admins remove anyone's. League posts: admins only. */
    async remove(actor: Actor, messageId: string): Promise<Result<null, FeedError>> {
      const message = await messages.getById(messageId);
      if (!message || message.deleted) return err("not_found", "That message is already gone.");
      const isAuthor = message.author?.id === actor.id;
      if (!isAuthor && !isAdminRole(actor.role)) {
        return err("not_allowed", "You can only remove your own messages.");
      }
      return messages.softDelete(messageId, now());
    },
  };
}
