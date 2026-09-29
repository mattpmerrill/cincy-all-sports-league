import { describe, expect, it } from "vitest";
import {
  addReaction,
  assembleThreads,
  markDeleted,
  mergeMessages,
  removeReaction,
  summarizeReactions,
  type Message,
  type ReactionRow,
} from "./index";

const msg = (id: string, createdAt: string, parentId: string | null = null): Message => ({
  id,
  kind: "member",
  parentId,
  body: `body ${id}`,
  deleted: false,
  author: null,
  payload: null,
  createdAt,
});

describe("assembleThreads", () => {
  it("puts top-level messages newest first and replies oldest first under their parent", () => {
    const threads = assembleThreads([
      msg("r2", "2026-09-29T10:20:00Z", "old"),
      msg("new", "2026-09-29T11:00:00Z"),
      msg("old", "2026-09-29T10:00:00Z"),
      msg("r1", "2026-09-29T10:10:00Z", "old"),
    ]);
    expect(threads.map((t) => t.message.id)).toEqual(["new", "old"]);
    expect(threads[1]?.replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(threads[0]?.replies).toEqual([]);
  });

  it("drops a reply whose parent is on a page that is not loaded", () => {
    expect(assembleThreads([msg("orphan", "2026-09-29T10:00:00Z", "missing")])).toEqual([]);
  });
});

describe("summarizeReactions", () => {
  const rows: ReactionRow[] = [
    { messageId: "m1", userId: "me", emoji: "fire" },
    { messageId: "m1", userId: "you", emoji: "fire" },
    { messageId: "m1", userId: "you", emoji: "goat" },
    { messageId: "m2", userId: "me", emoji: "skull" },
  ];

  it("counts per emoji for one message in catalog order and flags the viewer's own", () => {
    const summary = summarizeReactions(rows, "m1", "me");
    expect(summary.map((s) => s.name)).toEqual(["fire", "laugh", "skull", "clap", "goat"]);
    expect(summary.map((s) => s.count)).toEqual([2, 0, 0, 0, 1]);
    expect(summary.map((s) => s.reactedByMe)).toEqual([true, false, false, false, false]);
    expect(summary[0]?.glyph).toBe("🔥");
  });

  it("never marks anything as mine for a signed-out viewer", () => {
    expect(summarizeReactions(rows, "m1", null).some((s) => s.reactedByMe)).toBe(false);
  });
});

describe("merging live changes", () => {
  it("does not double count a reaction that arrives both optimistically and from realtime", () => {
    const row: ReactionRow = { messageId: "m1", userId: "me", emoji: "fire" };
    const once = addReaction([], row);
    expect(addReaction(once, row)).toHaveLength(1);
    expect(removeReaction(once, row)).toEqual([]);
  });

  it("replaces a message reported twice and blanks the text of a deleted one", () => {
    const a = msg("a", "2026-09-29T10:00:00Z");
    const merged = mergeMessages([a], [a, msg("b", "2026-09-29T10:01:00Z")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    const [removed] = markDeleted(merged, "a");
    expect(removed).toMatchObject({ deleted: true, body: "" });
  });
});
