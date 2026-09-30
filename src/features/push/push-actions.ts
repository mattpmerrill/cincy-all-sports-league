import type { PushTopic } from "@/domain/push";
import type { AppError, Result } from "@/lib/result";
import type { PushSubscriptionInput } from "./schemas";

type R<T> = Result<T, AppError>;

/**
 * The Server Actions the alerts UI calls. They live in `app/me/alerts-actions.ts` (transport and
 * auth) and are passed down as props, because a feature may not import from `app`.
 *
 * `subscribe` takes what `PushSubscription.toJSON()` yields once the client has checked its
 * optional fields exist; the server parses it again, because an action is a public POST endpoint.
 * `deviceCount` is the member's devices after the change, for the "Also on N other devices" line.
 */
export type PushActions = {
  subscribe(input: PushSubscriptionInput): Promise<R<{ deviceCount: number }>>;
  unsubscribe(input: { endpoint: string }): Promise<R<{ deviceCount: number }>>;
  setTopic(input: { topic: PushTopic; on: boolean }): Promise<R<{ on: boolean }>>;
  sendTest(input: { endpoint: string }): Promise<R<null>>;
};
