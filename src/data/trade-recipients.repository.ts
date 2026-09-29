import type { DbClient } from "./db-client";

/** Where a trade alert would go, and whether the member wants it. */
export type TradeRecipient = { email: string; tradeEmails: boolean };

export type TradeRecipientsRepository = ReturnType<typeof createTradeRecipientsRepository>;

/**
 * Needs the secret-key client: addresses live in auth.users, which profiles deliberately do not
 * copy, and reading them through the auth admin API bypasses RLS.
 */
export function createTradeRecipientsRepository(db: DbClient) {
  return {
    /**
     * The confirmed address and trade-email preference for one member. Null when the member has
     * no profile or no confirmed address (the same rule the weekly digest applies), so the caller
     * has nothing to send to.
     */
    async getRecipient(userId: string): Promise<TradeRecipient | null> {
      const { data: profile, error } = await db
        .from("profiles")
        .select("trade_emails")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const { data: auth, error: authError } = await db.auth.admin.getUserById(userId);
      // An unknown id is "no recipient", not an outage; anything else is thrown and logged.
      if (authError) {
        if (authError.status === 404) return null;
        throw authError;
      }
      const user = auth.user;
      if (!user.email || !user.email_confirmed_at) return null;
      return { email: user.email, tradeEmails: profile.trade_emails };
    },
  };
}
