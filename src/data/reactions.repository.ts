import type { ReactionName, ReactionRow } from "@/domain/feed/reactions";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { PG, type DbClient } from "./db-client";
import { fetchAllRows } from "./paginate";

export type ReactError = AppError<"not_allowed" | "not_found">;

export type ReactionsRepository = ReturnType<typeof createReactionsRepository>;

export function createReactionsRepository(db: DbClient) {
  return {
    async listForMessages(messageIds: readonly string[]): Promise<ReactionRow[]> {
      if (messageIds.length === 0) return [];
      const rows = await fetchAllRows<{ message_id: string; user_id: string; emoji: ReactionName }>(
        (from, to) =>
          db
            .from("message_reactions")
            .select("message_id, user_id, emoji")
            .in("message_id", [...messageIds])
            .order("created_at")
            .range(from, to),
      );
      return rows.map((r) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji }));
    },

    /** Idempotent: reacting twice with the same emoji is a no-op, not an error. */
    async add(row: ReactionRow): Promise<Result<null, ReactError>> {
      const { error } = await db
        .from("message_reactions")
        .insert({ message_id: row.messageId, user_id: row.userId, emoji: row.emoji });
      if (!error || error.code === PG.uniqueViolation) return ok(null);
      if (error.code === PG.insufficientPrivilege) {
        return err("not_allowed", "Only team owners can react, and not to removed messages.");
      }
      if (error.code === PG.foreignKeyViolation) {
        return err("not_found", "That message no longer exists.");
      }
      throw error;
    },

    /** Removing your own reaction; removing one that is already gone is fine. */
    async remove(row: ReactionRow): Promise<Result<null, ReactError>> {
      const { error } = await db
        .from("message_reactions")
        .delete()
        .eq("message_id", row.messageId)
        .eq("user_id", row.userId)
        .eq("emoji", row.emoji);
      if (error) throw error;
      return ok(null);
    },
  };
}
