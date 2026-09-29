import type { Message } from "@/domain/feed";
import type { AppError, Result } from "@/lib/result";
import type { FeedPage } from "./feed.service";

type R<T> = Result<T, AppError>;

/**
 * The Server Actions the client feed calls. They live in `app/feed/actions.ts` (transport and
 * auth) and are passed down as props, because a feature may not import from `app`.
 */
export type FeedActions = {
  post(input: { body: string }): Promise<R<Message>>;
  reply(input: { parentId: string; body: string }): Promise<R<Message>>;
  react(input: { messageId: string; emoji: string; on: boolean }): Promise<R<null>>;
  remove(input: { messageId: string }): Promise<R<null>>;
  loadOlder(input: { before: string }): Promise<R<FeedPage>>;
  loadMessage(input: { messageId: string }): Promise<R<Message>>;
};
