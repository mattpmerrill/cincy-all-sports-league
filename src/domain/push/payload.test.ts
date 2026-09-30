import { describe, expect, it } from "vitest";
import {
  MAX_PAYLOAD_BYTES,
  PUSH_LIMITS,
  clipText,
  encodePushPayload,
  pushMessage,
  pushPayloadSchema,
} from "./payload";
import type { PushMessage } from "./types";

const base: PushMessage = {
  title: "Title",
  body: "Body",
  url: "/feed",
  tag: "tag",
  renotify: true,
};

describe("clipText", () => {
  it("never splits an emoji surrogate pair", () => {
    const clipped = clipText("🔥".repeat(100), 10);
    expect(Array.from(clipped)).toHaveLength(10);
    expect(clipped).toBe(`${"🔥".repeat(9)}…`);
    // A lone surrogate is what a UTF-16 slice would leave behind.
    expect(clipped.isWellFormed()).toBe(true);
  });

  it("drops bidi overrides but keeps the joiners emoji sequences need", () => {
    expect(clipText("a\u202Eb\u2066c\u2069d", 10)).toBe("abcd");
    expect(clipText("👨\u200D👩", 10)).toBe("👨\u200D👩");
  });

  it("replaces a lone surrogate so the text always encodes", () => {
    expect(clipText("a\uD83Db", 10)).toBe("a\uFFFDb");
    expect(clipText(`\uD83D${"x".repeat(50)}`, 10).isWellFormed()).toBe(true);
  });

  it("leaves text at the limit alone and collapses whitespace and control characters", () => {
    expect(clipText("a\n\n  b\t\u0000c", 10)).toBe("a b c");
    expect(clipText("x".repeat(10), 10)).toBe("x".repeat(10));
  });
});

describe("pushMessage", () => {
  it("clips every field to its limit", () => {
    const m = pushMessage({
      ...base,
      title: "t".repeat(500),
      body: "b".repeat(500),
      tag: "g".repeat(500),
    });
    expect(Array.from(m.title)).toHaveLength(PUSH_LIMITS.title);
    expect(Array.from(m.body)).toHaveLength(PUSH_LIMITS.body);
    expect(m.tag).toHaveLength(PUSH_LIMITS.tag);
  });

  it("forces the url to a same-origin path", () => {
    const urlFor = (url: string) => pushMessage({ ...base, url }).url;
    expect(urlFor("/trades/abc?x=1#y")).toBe("/trades/abc?x=1#y");
    for (const bad of [
      "https://evil.com/",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "javascript:alert(1)",
      "trades/abc",
      "",
      `/${"a".repeat(PUSH_LIMITS.url)}`,
    ]) {
      expect(urlFor(bad)).toBe("/");
    }
  });

  it("keeps the tag inside the worker's character set and never empty", () => {
    expect(pushMessage({ ...base, tag: "scores-a b/c!" }).tag).toBe("scores-a-b-c-");
    expect(pushMessage({ ...base, tag: "" }).tag).toBe("alert");
  });

  it("never sends an empty title, which the worker would replace", () => {
    expect(pushMessage({ ...base, title: "  \n " }).title).not.toBe("");
  });
});

describe("encodePushPayload", () => {
  it("round-trips through the worker's schema", () => {
    const json = encodePushPayload(pushMessage(base));
    expect(pushPayloadSchema.parse(JSON.parse(json))).toEqual({ v: 1, ...base });
  });

  it("stays under the byte cap for the worst case of four-byte characters and quotes", () => {
    const worst = pushMessage({
      title: "🔥".repeat(500),
      body: '"'.repeat(500) + "🐐".repeat(500),
      url: `/${"é".repeat(PUSH_LIMITS.url - 1)}`,
      tag: "g".repeat(500),
      renotify: true,
    });
    const bytes = new TextEncoder().encode(encodePushPayload(worst)).length;
    expect(bytes).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(pushPayloadSchema.safeParse(JSON.parse(encodePushPayload(worst))).success).toBe(true);
  });

  it("refuses a message that skipped pushMessage and is too big", () => {
    expect(() => encodePushPayload({ ...base, body: "x".repeat(MAX_PAYLOAD_BYTES) })).toThrow(
      /exceeds/,
    );
  });
});

describe("pushPayloadSchema length unit", () => {
  const ok = { v: 1, ...base };

  it("counts code points, so a worker using string length would wrongly reject these", () => {
    expect(pushPayloadSchema.safeParse({ ...ok, body: "🔥".repeat(200) }).success).toBe(true);
    expect(pushPayloadSchema.safeParse({ ...ok, body: "🔥".repeat(201) }).success).toBe(false);
    expect(pushPayloadSchema.safeParse({ ...ok, title: "🔥".repeat(80) }).success).toBe(true);
    expect(pushPayloadSchema.safeParse({ ...ok, title: "🔥".repeat(81) }).success).toBe(false);
  });
});

describe("pushPayloadSchema", () => {
  it("rejects what the worker would reject", () => {
    const ok = { v: 1, ...base };
    expect(pushPayloadSchema.safeParse(ok).success).toBe(true);
    for (const patch of [
      { v: 2 },
      { title: "" },
      { url: "//evil.com" },
      { url: "/\\evil.com" },
      { tag: "has space" },
      { renotify: "yes" },
    ]) {
      expect(pushPayloadSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
    }
  });
});
