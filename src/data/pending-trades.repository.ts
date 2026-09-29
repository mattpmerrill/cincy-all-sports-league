import { z } from "zod";
import type { DbClient } from "./db-client";

// The rpc returns a bare integer; this is the trust boundary for what the database sent back.
const countSchema = z.number().int().min(0);

export type PendingTradesRepository = ReturnType<typeof createPendingTradesRepository>;

/**
 * Safe to build from the browser client: it only calls a function that is granted to `authenticated`
 * and answers for `auth.uid()`, so it reads nothing the caller could not already see.
 */
export function createPendingTradesRepository(db: DbClient) {
  return {
    /** Pending offers on the caller's own open, unexpired listings in the active season. */
    async countPendingDecisions(): Promise<number> {
      const { data, error } = await db.rpc("pending_trade_decisions");
      if (error) throw error;
      return countSchema.parse(data);
    },
  };
}
