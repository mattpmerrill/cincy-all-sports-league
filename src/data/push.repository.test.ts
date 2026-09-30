import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db-client";
import { PUSH_TOPIC_COLUMN, PushStorageError, createPushRepository } from "./push.repository";

const ACTOR = "6f3b7c1e-8c1a-4a55-9d0a-1b2c3d4e5f60";
const SUB_ID = "0b9f7e2a-3f52-4d27-8f6e-4d3a5b6c7d80";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/SECRET-DEVICE-TOKEN";
const P256DH = "P".repeat(87);
const AUTH = "A".repeat(22);

type Result = { data?: unknown; error?: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

/**
 * A chainable stand-in for a query builder: every method records its call and returns the same
 * object, and awaiting it yields `result`. Enough to assert what the repository asked for.
 */
function fakeDb(result: Result = {}) {
  const calls: Call[] = [];
  const query: Record<string, unknown> = {};
  for (const method of [
    "select",
    "upsert",
    "delete",
    "update",
    "eq",
    "in",
    "order",
    "maybeSingle",
  ]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: null, error: null, count: null, ...result });
  const from = vi.fn(() => query);
  const rpc = vi.fn(async () => ({ data: null, error: null, ...result }));
  const db = { from, rpc } as unknown as DbClient;
  return { repo: createPushRepository(db), from, rpc, calls };
}

/** What Postgres attaches to a constraint failure: the failing row, keys and all. */
const leakyError = {
  code: "23514",
  message: `new row for relation "push_subscriptions" violates check constraint`,
  details: `Failing row contains (${SUB_ID}, ${ACTOR}, ${ENDPOINT}, ${P256DH}, ${AUTH}).`,
};

describe("register", () => {
  const input = {
    actorId: ACTOR,
    endpoint: ENDPOINT,
    p256dh: P256DH,
    auth: AUTH,
    deviceLabel: "iPhone",
  };

  it("calls the function with the exact parameter names and returns the device id", async () => {
    const { repo, rpc } = fakeDb({ data: SUB_ID });
    expect(await repo.register(input)).toEqual({ ok: true, value: { id: SUB_ID } });
    expect(rpc).toHaveBeenCalledWith("register_push_subscription", {
      p_actor: ACTOR,
      p_endpoint: ENDPOINT,
      p_p256dh: P256DH,
      p_auth: AUTH,
      p_device_label: "iPhone",
    });
  });

  it.each(["not_found", "invalid_subscription"] as const)("maps the %s token", async (token) => {
    const { repo } = fakeDb({ error: { code: "P0001", message: token, details: null } });
    const result = await repo.register(input);
    expect(result).toMatchObject({ ok: false, error: { code: token } });
    if (!result.ok) expect(result.error.message).not.toContain("_");
  });

  it("throws for an error it does not own, and the throw carries no row data", async () => {
    const { repo } = fakeDb({ error: leakyError });
    const failure = await repo.register(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushStorageError);
    expect(String(failure)).toContain("register");
    expect(String(failure)).toContain("23514");
  });

  it("does not map a P0001 with an unknown token", async () => {
    const { repo } = fakeDb({ error: { code: "P0001", message: "invalid_max", details: null } });
    await expect(repo.register(input)).rejects.toBeInstanceOf(PushStorageError);
  });
});

describe("no operation leaks a database error", () => {
  const operations: [string, (repo: ReturnType<typeof fakeDb>["repo"]) => Promise<unknown>][] = [
    ["listTargets", (r) => r.listTargets([ACTOR], "trades")],
    ["claim", (r) => r.claim(ACTOR, "k")],
    ["remove", (r) => r.remove(SUB_ID)],
    ["recordSuccess", (r) => r.recordSuccess([SUB_ID], new Date())],
    ["recordFailure", (r) => r.recordFailure(SUB_ID, 5)],
    ["removeOwned", (r) => r.removeOwned(ACTOR, ENDPOINT)],
    ["countOwned", (r) => r.countOwned(ACTOR)],
    ["getOwned", (r) => r.getOwned(ACTOR, ENDPOINT)],
    ["listOwned", (r) => r.listOwned(ACTOR)],
  ];

  it.each(operations)("%s throws only the operation and the SQLSTATE", async (name, run) => {
    const { repo } = fakeDb({ error: leakyError });
    const failure = await run(repo).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushStorageError);
    // Everything an error could serialize into a log line: message, stack and own properties.
    const surface = [String(failure), (failure as Error).stack, JSON.stringify(failure)].join("\n");
    for (const secret of [ENDPOINT, P256DH, AUTH, "Failing row", "SECRET-DEVICE-TOKEN"]) {
      expect(surface).not.toContain(secret);
    }
    expect(surface).toContain(name);
  });
});

describe("listTargets", () => {
  it("maps rows to targets and asks for the topic", async () => {
    const { repo, rpc } = fakeDb({
      data: [{ id: SUB_ID, user_id: ACTOR, endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH }],
    });
    expect(await repo.listTargets([ACTOR], "feed")).toEqual([
      {
        subscriptionId: SUB_ID,
        recipientId: ACTOR,
        endpoint: ENDPOINT,
        keys: { p256dh: P256DH, auth: AUTH },
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("push_targets", { p_user_ids: [ACTOR], p_topic: "feed" });
  });

  it("makes no round trip for nobody", async () => {
    const { repo, rpc } = fakeDb();
    expect(await repo.listTargets([], "trades")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("claim", () => {
  it("is true when the ledger row was inserted and false when it already existed", async () => {
    const won = fakeDb({ data: [{ recipient_id: ACTOR }] });
    expect(await won.repo.claim(ACTOR, "reply:1")).toBe(true);
    expect(won.from).toHaveBeenCalledWith("push_sends");
    expect(won.calls[0]).toEqual({
      method: "upsert",
      args: [
        { recipient_id: ACTOR, dedupe_key: "reply:1" },
        { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true },
      ],
    });

    const lost = fakeDb({ data: [] });
    expect(await lost.repo.claim(ACTOR, "reply:1")).toBe(false);
  });
});

describe("recording outcomes", () => {
  it("returns what record_push_failure decided", async () => {
    for (const outcome of ["counted", "pruned", "missing"] as const) {
      const { repo, rpc } = fakeDb({ data: outcome });
      expect(await repo.recordFailure(SUB_ID, 5)).toBe(outcome);
      expect(rpc).toHaveBeenCalledWith("record_push_failure", { p_id: SUB_ID, p_max: 5 });
    }
  });

  it("refuses an outcome it does not know", async () => {
    const { repo } = fakeDb({ data: "exploded" });
    await expect(repo.recordFailure(SUB_ID, 5)).rejects.toThrow();
  });

  it("treats invalid_max as the programmer error it is", async () => {
    const { repo } = fakeDb({ error: { code: "P0001", message: "invalid_max", details: null } });
    await expect(repo.recordFailure(SUB_ID, 0)).rejects.toBeInstanceOf(PushStorageError);
  });

  it("stamps success and forgives past failures for the given devices only", async () => {
    const { repo, calls } = fakeDb();
    const now = new Date("2026-09-29T12:00:00Z");
    await repo.recordSuccess([SUB_ID], now);
    expect(calls).toEqual([
      { method: "update", args: [{ failure_count: 0, last_success_at: now.toISOString() }] },
      { method: "in", args: ["id", [SUB_ID]] },
    ]);
  });

  it("does nothing for an empty list", async () => {
    const { repo, from } = fakeDb();
    await repo.recordSuccess([], new Date());
    expect(from).not.toHaveBeenCalled();
  });
});

describe("a member's own devices", () => {
  it("removeOwned scopes by owner and endpoint and reports whether a row went", async () => {
    const gone = fakeDb({ data: [{ id: SUB_ID }] });
    expect(await gone.repo.removeOwned(ACTOR, ENDPOINT)).toBe(true);
    expect(gone.calls.filter((c) => c.method === "eq")).toEqual([
      { method: "eq", args: ["user_id", ACTOR] },
      { method: "eq", args: ["endpoint", ENDPOINT] },
    ]);
    expect(await fakeDb({ data: [] }).repo.removeOwned(ACTOR, ENDPOINT)).toBe(false);
  });

  it("countOwned counts and defaults to zero", async () => {
    expect(await fakeDb({ count: 3 }).repo.countOwned(ACTOR)).toBe(3);
    expect(await fakeDb({ count: null }).repo.countOwned(ACTOR)).toBe(0);
  });

  it("getOwned maps the row to a target, or null", async () => {
    const row = { id: SUB_ID, user_id: ACTOR, endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH };
    expect(await fakeDb({ data: row }).repo.getOwned(ACTOR, ENDPOINT)).toEqual({
      subscriptionId: SUB_ID,
      recipientId: ACTOR,
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
    });
    expect(await fakeDb({ data: null }).repo.getOwned(ACTOR, ENDPOINT)).toBeNull();
  });

  it("listOwned never selects the endpoint or the keys", async () => {
    const { repo, calls } = fakeDb({
      data: [
        {
          id: SUB_ID,
          device_label: "iPhone",
          last_registered_at: "2026-09-29T10:00:00Z",
          last_success_at: null,
        },
      ],
    });
    expect(await repo.listOwned(ACTOR)).toEqual([
      { id: SUB_ID, label: "iPhone", registeredAt: "2026-09-29T10:00:00Z", lastSuccessAt: null },
    ]);
    const selected = String(calls.find((c) => c.method === "select")?.args[0]);
    expect(selected).not.toMatch(/endpoint|p256dh|auth\b/);
  });
});

describe("PUSH_TOPIC_COLUMN", () => {
  it("names one profiles column per topic", () => {
    expect(PUSH_TOPIC_COLUMN).toEqual({
      trades: "push_trades",
      feed: "push_feed",
      scores: "push_scores",
    });
  });
});
