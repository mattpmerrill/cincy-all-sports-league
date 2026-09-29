import { z } from "zod";
import { REACTION_NAMES, messageBodySchema } from "@/domain/feed";

export const postSchema = z.object({ body: messageBodySchema });

export const replySchema = z.object({ parentId: z.uuid(), body: messageBodySchema });

export const reactionSchema = z.object({
  messageId: z.uuid(),
  emoji: z.enum(REACTION_NAMES),
  /** The state the caller wants, not a toggle, so a retry or a double tap cannot flip it back. */
  on: z.boolean(),
});

export const messageIdSchema = z.object({ messageId: z.uuid() });

export const olderSchema = z.object({ before: z.string().min(1).max(64) });

/** The columns of a realtime postgres_changes payload the feed reads. Validated because the
 * payload is untyped JSON from the wire. */
export const realtimeMessageSchema = z.object({
  id: z.uuid(),
  deleted_at: z.string().nullable().optional(),
});

export const realtimeReactionSchema = z.object({
  message_id: z.uuid(),
  user_id: z.uuid(),
  emoji: z.enum(REACTION_NAMES),
});
