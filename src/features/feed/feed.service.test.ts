import { describe, expect, it, vi } from "vitest";
import type { Message, ReactionRow } from "@/domain/feed";
import type { PushAlert, PushNotifier } from "@/domain/push";
import { createLogger } from "@/lib/logger";
import { err, ok } from "@/lib/result";
import { createFeedService, type FeedActor, type FeedDeps } from "./feed.service";

const member: FeedActor = { id: "u-member", role: "member", displayName: "Member" };
const other: FeedActor = { id: "u-other", role: "member", displayName: "Other" };
const admin: FeedActor = { id: "u-admin", role: "admin", displayName: "Admin" };

const message = (over: Partial<Message> = {}): Message => ({
  id: "m1",
  kind: "member",
  parentId: null,
  body: "hi",
  deleted: false,
  author: { id: member.id, displayName: "Member", avatarUrl: null, team: null },
  payload: null,
  createdAt: "2026-09-29T12:00:00Z",
  ...over,
});

function setup(
  opts: {
    owners?: string[];
    stored?: Message[];
    insert?: FeedDeps["messages"]["insertMember"];
    add?: FeedDeps["reactions"]["add"];
    notifier?: PushNotifier;
    reactionRows?: ReactionRow[];
  } = {},
) {
  const owners = new Set(opts.owners ?? [member.id, other.id]);
  const stored = opts.stored ?? [message()];
  const softDelete = vi.fn<FeedDeps["messages"]["softDelete"]>(async () => ok(null));
  const insertMember = vi.fn<FeedDeps["messages"]["insertMember"]>(
    opts.insert ??
      (async (input) => ok(message({ id: "new", body: input.body, parentId: input.parentId }))),
  );
  const add = vi.fn<FeedDeps["reactions"]["add"]>(opts.add ?? (async () => ok(null)));
  const remove = vi.fn<FeedDeps["reactions"]["remove"]>(async () => ok(null));
  const getById = vi.fn<FeedDeps["messages"]["getById"]>(
    async (id) => stored.find((m) => m.id === id) ?? null,
  );
  const listForMessages = vi.fn<FeedDeps["reactions"]["listForMessages"]>(
    async () => opts.reactionRows ?? [],
  );
  // Records the deferred builds without running them, like `after()` before the response ends.
  const builds: Parameters<PushNotifier["notify"]>[0][] = [];
  const notifier: PushNotifier = opts.notifier ?? { notify: (build) => void builds.push(build) };
  const service = createFeedService({
    messages: {
      getActiveSeasonId: async () => "season",
      getById,
      listPage: async () => ({ messages: stored, hasMore: false }),
      insertMember,
      softDelete,
    },
    reactions: { listForMessages, add, remove },
    teams: {
      getOwnedBy: async (id) => (owners.has(id) ? { id: "t", name: "T", slug: "t" } : null),
    },
    notifier,
    logger: createLogger(),
    now: () => new Date("2026-09-29T13:00:00Z"),
  });
  const alertsFrom = async (index: number): Promise<readonly PushAlert[]> => {
    const build = builds[index];
    return build ? build() : [];
  };
  return {
    service,
    insertMember,
    softDelete,
    add,
    remove,
    getById,
    listForMessages,
    builds,
    alertsFrom,
  };
}

describe("posting", () => {
  it("lets a team owner post and reply", async () => {
    const { service, insertMember } = setup();
    expect((await service.post(member, "trash")).ok).toBe(true);
    expect((await service.reply(member, "m1", "back at you")).ok).toBe(true);
    expect(insertMember).toHaveBeenLastCalledWith({
      seasonId: "season",
      authorId: member.id,
      body: "back at you",
      parentId: "m1",
    });
  });

  it("refuses someone without an approved team, before touching the repository", async () => {
    const { service, insertMember } = setup({ owners: [] });
    const result = await service.post(member, "hello");
    expect(result).toMatchObject({ ok: false, error: { code: "not_allowed" } });
    expect(insertMember).not.toHaveBeenCalled();
  });

  it("passes the rate limit through as a typed code", async () => {
    const { service } = setup({ insert: async () => err("rate_limited", "Easy there.") });
    expect(await service.post(member, "again")).toMatchObject({
      ok: false,
      error: { code: "rate_limited" },
    });
  });

  it("refuses a reply to a reply, a removed message or a message that does not exist", async () => {
    const { service, insertMember } = setup({
      stored: [
        message({ id: "top" }),
        message({ id: "reply", parentId: "top" }),
        message({ id: "gone", deleted: true, body: "" }),
      ],
    });
    expect(await service.reply(member, "reply", "x")).toMatchObject({ error: { code: "invalid" } });
    expect(await service.reply(member, "gone", "x")).toMatchObject({
      error: { code: "not_found" },
    });
    expect(await service.reply(member, "nope", "x")).toMatchObject({
      error: { code: "not_found" },
    });
    expect(insertMember).not.toHaveBeenCalled();
  });
});

describe("removing", () => {
  it("lets the author remove their own message", async () => {
    const { service, softDelete } = setup();
    expect((await service.remove(member, "m1")).ok).toBe(true);
    expect(softDelete).toHaveBeenCalledWith("m1", new Date("2026-09-29T13:00:00Z"));
  });

  it("refuses another member, but lets an admin remove anyone's message or a league post", async () => {
    const { service, softDelete } = setup({
      stored: [message(), message({ id: "league", kind: "league", author: null })],
    });
    expect(await service.remove(other, "m1")).toMatchObject({ error: { code: "not_allowed" } });
    expect(await service.remove(other, "league")).toMatchObject({ error: { code: "not_allowed" } });
    expect(softDelete).not.toHaveBeenCalled();
    expect((await service.remove(admin, "m1")).ok).toBe(true);
    expect((await service.remove(admin, "league")).ok).toBe(true);
  });

  it("reports a message that is already gone", async () => {
    const { service } = setup({ stored: [message({ deleted: true, body: "" })] });
    expect(await service.remove(admin, "m1")).toMatchObject({ error: { code: "not_found" } });
  });
});

describe("reactions", () => {
  it("adds for team owners only, but anyone can take their own reaction back", async () => {
    const { service, add, remove } = setup({ owners: [] });
    expect(await service.setReaction(member, "m1", "fire", true)).toMatchObject({
      error: { code: "not_allowed" },
    });
    expect(add).not.toHaveBeenCalled();
    expect((await service.setReaction(member, "m1", "fire", false)).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith({ messageId: "m1", userId: member.id, emoji: "fire" });
  });
});

describe("reply alerts", () => {
  it("builds one alert for the author when someone else replies", async () => {
    const { service, builds, alertsFrom } = setup();
    expect((await service.reply(other, "m1", "nice try")).ok).toBe(true);
    expect(builds).toHaveLength(1);
    expect(await alertsFrom(0)).toEqual([
      expect.objectContaining({
        topic: "feed",
        recipientId: member.id,
        dedupeKey: "reply:new",
        message: expect.objectContaining({ title: "Other replied to your post", body: "nice try" }),
      }),
    ]);
  });

  it("tells nobody about a reply to your own post", async () => {
    const { service, alertsFrom } = setup();
    await service.reply(member, "m1", "talking to myself");
    expect(await alertsFrom(0)).toEqual([]);
  });

  it("tells nobody about a reply to a league post", async () => {
    const { service, alertsFrom } = setup({
      stored: [message({ id: "league", kind: "league", author: null })],
    });
    await service.reply(member, "league", "big update");
    expect(await alertsFrom(0)).toEqual([]);
  });

  it("does not notify for a top-level post or a refused reply", async () => {
    const { service, builds } = setup({
      stored: [message(), message({ id: "gone", deleted: true, body: "" })],
    });
    await service.post(member, "hello");
    await service.reply(member, "gone", "x");
    expect(builds).toHaveLength(0);
  });

  it("does not notify when the reply could not be saved", async () => {
    const { service, builds } = setup({ insert: async () => err("rate_limited", "Easy there.") });
    await service.reply(other, "m1", "again");
    expect(builds).toHaveLength(0);
  });
});

describe("reaction alerts", () => {
  it("reads the post and its reactions only when the deferred build runs", async () => {
    const { service, builds, getById, listForMessages, alertsFrom } = setup({
      reactionRows: [{ messageId: "m1", userId: other.id, emoji: "fire" }],
    });
    getById.mockClear();
    expect((await service.setReaction(other, "m1", "fire", true)).ok).toBe(true);
    expect(builds).toHaveLength(1);
    expect(getById).not.toHaveBeenCalled();
    expect(listForMessages).not.toHaveBeenCalled();

    const alerts = await alertsFrom(0);
    expect(getById).toHaveBeenCalledWith("m1");
    expect(listForMessages).toHaveBeenCalledWith(["m1"]);
    expect(alerts).toEqual([
      expect.objectContaining({
        recipientId: member.id,
        dedupeKey: "reaction:m1:u-other",
        message: expect.objectContaining({ title: expect.stringContaining("Other reacted") }),
      }),
    ]);
  });

  it("counts the post's other reactors so a busy post reads as one alert", async () => {
    const { service, alertsFrom } = setup({
      reactionRows: [
        { messageId: "m1", userId: "u-a", emoji: "fire" },
        { messageId: "m1", userId: "u-b", emoji: "laugh" },
        { messageId: "m1", userId: other.id, emoji: "fire" },
        { messageId: "m1", userId: member.id, emoji: "fire" },
      ],
    });
    await service.setReaction(other, "m1", "fire", true);
    expect(await alertsFrom(0)).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ title: "Other and 2 others reacted to your post" }),
      }),
    ]);
  });

  it("tells nobody about a reaction to your own post, a league post or a removed post", async () => {
    const { service, alertsFrom } = setup({
      stored: [
        message(),
        message({ id: "league", kind: "league", author: null }),
        message({ id: "gone", deleted: true, body: "" }),
      ],
    });
    await service.setReaction(member, "m1", "fire", true);
    await service.setReaction(other, "league", "fire", true);
    await service.setReaction(other, "gone", "fire", true);
    expect(await alertsFrom(0)).toEqual([]);
    expect(await alertsFrom(1)).toEqual([]);
    expect(await alertsFrom(2)).toEqual([]);
  });

  it("does not notify when a reaction is removed or the add failed", async () => {
    const { service, builds } = setup({ add: async () => err("not_found", "Gone.") });
    await service.setReaction(other, "m1", "fire", false);
    expect(await service.setReaction(other, "m1", "fire", true)).toMatchObject({ ok: false });
    expect(builds).toHaveLength(0);
  });
});

describe("a throwing notifier", () => {
  const throwing: PushNotifier = {
    notify: () => {
      throw new Error("after() is unavailable");
    },
  };

  it("never changes the result of a reply or a reaction", async () => {
    const { service } = setup({ notifier: throwing });
    expect((await service.reply(other, "m1", "hi")).ok).toBe(true);
    expect((await service.setReaction(other, "m1", "fire", true)).ok).toBe(true);
  });
});

describe("reading", () => {
  it("hides removed messages from the leaderboard preview and caps the count", async () => {
    const { service } = setup({
      stored: [
        message({ id: "a", deleted: true, body: "" }),
        message({ id: "b" }),
        message({ id: "c" }),
        message({ id: "d" }),
      ],
    });
    expect((await service.getLatest(2)).map((m) => m.id)).toEqual(["b", "c"]);
  });
});
