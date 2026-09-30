import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db-client";
import { PUSH_TOPIC_COLUMN, createProfilesRepository } from "./profiles.repository";

describe("email opt-ins", () => {
  it("reads the named column, and null when there is no profile", async () => {
    const select = vi.fn();
    const chain = (data: unknown) => ({
      select: (columns: string) => {
        select(columns);
        return { eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) };
      },
    });
    const has = createProfilesRepository({
      from: () => chain({ trade_emails: false }),
    } as unknown as DbClient);
    expect(await has.getOptIn("u1", "trade_emails")).toBe(false);
    expect(select).toHaveBeenCalledWith("trade_emails");

    const missing = createProfilesRepository({ from: () => chain(null) } as unknown as DbClient);
    expect(await missing.getOptIn("u1", "weekly_email_opt_in")).toBeNull();
  });

  it("writes only the named column, and reports whether a row matched", async () => {
    const update = vi.fn();
    const db = (data: unknown) =>
      ({
        from: () => ({
          update: (values: unknown) => {
            update(values);
            return {
              eq: () => ({ select: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
            };
          },
        }),
      }) as unknown as DbClient;

    expect(
      await createProfilesRepository(db({ id: "u1" })).setOptIn("u1", "weekly_email_opt_in", false),
    ).toBe(true);
    expect(update).toHaveBeenCalledWith({ weekly_email_opt_in: false });
    expect(await createProfilesRepository(db(null)).setOptIn("u1", "trade_emails", true)).toBe(
      false,
    );
    expect(update).toHaveBeenLastCalledWith({ trade_emails: true });
  });
});

describe("push switches", () => {
  const db = (data: unknown) => {
    const select = vi.fn();
    const client = {
      from: () => ({
        select: (columns: string) => {
          select(columns);
          return { eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) };
        },
      }),
    } as unknown as DbClient;
    return { select, repo: createProfilesRepository(client) };
  };

  it("reads all three columns in one select and maps them to topics", async () => {
    const { select, repo } = db({ push_trades: true, push_feed: false, push_scores: true });
    expect(await repo.getPushTopics("u1")).toEqual({ trades: true, feed: false, scores: true });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("push_trades, push_feed, push_scores");
  });

  it("is null when there is no profile", async () => {
    expect(await db(null).repo.getPushTopics("u1")).toBeNull();
  });

  it("names one profiles column per topic", () => {
    expect(PUSH_TOPIC_COLUMN).toEqual({
      trades: "push_trades",
      feed: "push_feed",
      scores: "push_scores",
    });
  });
});
