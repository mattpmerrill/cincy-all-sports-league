import type { DbClient } from "./db-client";
import { fetchAllRows } from "./paginate";

export type DigestMember = {
  userId: string;
  email: string;
  displayName: string;
  optedIn: boolean;
};

export type DigestSend = {
  weekStart: string;
  status: "sent" | "partial" | "failed";
  recipientCount: number;
};

export type DigestRepository = ReturnType<typeof createDigestRepository>;

const AUTH_PAGE_SIZE = 200;

/** Needs the secret-key client: emails live in auth.users and digest_sends has no policies. */
export function createDigestRepository(db: DbClient) {
  return {
    /**
     * Every member with a confirmed email and a profile. Emails come from the auth admin API
     * (paginated) because profiles deliberately hold none; the opt-in flag comes from profiles.
     */
    async listConfirmedMembers(): Promise<DigestMember[]> {
      const users: { id: string; email: string }[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
        if (error) throw error;
        for (const u of data.users) {
          if (u.email && u.email_confirmed_at) users.push({ id: u.id, email: u.email });
        }
        if (data.users.length < AUTH_PAGE_SIZE) break;
      }

      const profiles = await fetchAllRows((from, to) =>
        db
          .from("profiles")
          .select("id, display_name, weekly_email_opt_in")
          .order("id")
          .range(from, to),
      );
      const byId = new Map(profiles.map((p) => [p.id, p]));
      return users.flatMap((u) => {
        const profile = byId.get(u.id);
        return profile
          ? [
              {
                userId: u.id,
                email: u.email,
                displayName: profile.display_name,
                optedIn: profile.weekly_email_opt_in,
              },
            ]
          : [];
      });
    },

    async getSend(weekStart: string): Promise<DigestSend | null> {
      const { data, error } = await db
        .from("digest_sends")
        .select("week_start, status, recipient_count")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const status = data.status;
      if (status !== "sent" && status !== "partial" && status !== "failed") {
        throw new Error(`digest_sends has an unknown status "${status}"`);
      }
      return { weekStart: data.week_start, status, recipientCount: data.recipient_count };
    },

    /** Upsert so a retry after a fully failed run replaces its 'failed' row. */
    async recordSend(send: DigestSend & { sentAt: string }): Promise<void> {
      const { error } = await db.from("digest_sends").upsert(
        {
          week_start: send.weekStart,
          status: send.status,
          recipient_count: send.recipientCount,
          sent_at: send.sentAt,
        },
        { onConflict: "week_start" },
      );
      if (error) throw error;
    },
  };
}
