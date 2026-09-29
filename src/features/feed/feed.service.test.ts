import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/domain/feed";
import type { Actor } from "@/domain/membership/membership";
import { err, ok } from "@/lib/result";
import { createFeedService, type FeedDeps } from "./feed.service";

const member: Actor = { id: "u-member", role: "member" };
const other: Actor = { id: "u-other", role: "member" };
const admin: Actor = { id: "u-admin", role: "admin" };

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
  } = {},
) {
  const owners = new Set(opts.owners ?? [member.id, other.id]);
  const stored = opts.stored ?? [message()];
  const softDelete = vi.fn<FeedDeps["messages"]["softDelete"]>(async () => ok(null));
  const insertMember = vi.fn<FeedDeps["messages"]["insertMember"]>(
    opts.insert ??
      (async (input) => ok(message({ id: "new", body: input.body, parentId: input.parentId }))),
  );
  const add = vi.fn<FeedDeps["reactions"]["add"]>(async () => ok(null));
  const remove = vi.fn<FeedDeps["reactions"]["remove"]>(async () => ok(null));
  const service = createFeedService({
    messages: {
      getActiveSeasonId: async () => "season",
      getById: async (id) => stored.find((m) => m.id === id) ?? null,
      listPage: async () => ({ messages: stored, hasMore: false }),
      insertMember,
      softDelete,
    },
    reactions: { listForMessages: async () => [], add, remove },
    teams: {
      getOwnedBy: async (id) => (owners.has(id) ? { id: "t", name: "T", slug: "t" } : null),
    },
    now: () => new Date("2026-09-29T13:00:00Z"),
  });
  return { service, insertMember, softDelete, add, remove };
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
