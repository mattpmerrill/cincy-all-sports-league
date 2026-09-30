import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { ScoreUpdateItem } from "@/domain/feed";
import {
  encodePushPayload,
  pushPayloadSchema,
  reactionPushAlert,
  replyPushAlert,
  scorePushAlerts,
  testPushAlert,
  tradePushAlert,
} from "@/domain/push";
import type { PushMessage } from "@/domain/push";

/**
 * public/sw.js is hand-written JavaScript (a worker cannot import TypeScript), so this file is
 * what keeps it honest: it runs the real script in a vm with a fake worker scope, feeds it what
 * every domain builder produces, and holds it to the same accept/reject outcome as
 * `pushPayloadSchema` for a table of hostile and boundary payloads.
 */

const ORIGIN = "https://league.test";
const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

const FALLBACK_TITLE = "Cincy's All-Sports League";
const FALLBACK_OPTIONS = {
  body: "Something new in the league.",
  tag: "alert",
  renotify: false,
  icon: "/icon",
  badge: "/push-badge",
  data: { url: "/" },
  lang: "en",
};

type FakeEvent = {
  waitUntil: (work: Promise<unknown>) => void;
  data?: { json: () => unknown } | null;
  notification?: { close: () => void; data: unknown };
};
type Listener = (event: FakeEvent) => void;

type FakeClient = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
};

const client = (url: string, over: Partial<FakeClient> = {}): FakeClient => ({
  url,
  focus: vi.fn(() => Promise.resolve()),
  navigate: vi.fn(() => Promise.resolve()),
  ...over,
});

function loadWorker(existingClients: FakeClient[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn<(title: string, options: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const skipWaiting = vi.fn();
  const claim = vi.fn(() => Promise.resolve());
  const matchAll = vi.fn<(query: unknown) => Promise<FakeClient[]>>(() =>
    Promise.resolve(existingClients),
  );
  const openWindow = vi.fn<(url: string) => Promise<null>>(() => Promise.resolve(null));
  const scope = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { claim, matchAll, openWindow },
    skipWaiting,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  // A fresh context per worker, like a fresh worker global. URL is the one API the script needs
  // that a bare vm context does not have.
  vm.runInContext(SOURCE, vm.createContext({ self: scope, URL }));

  /** Dispatches an event and waits for everything the handler passed to waitUntil. */
  async function dispatch(type: string, event: Omit<FakeEvent, "waitUntil">) {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`no ${type} listener`);
    const work: Promise<unknown>[] = [];
    listener({ ...event, waitUntil: (p) => work.push(p) });
    await Promise.all(work);
    return work.length;
  }

  const push = (data: FakeEvent["data"]) => dispatch("push", { data });
  const click = (data: unknown) => {
    const close = vi.fn();
    return dispatch("notificationclick", { notification: { close, data } }).then((waits) => ({
      close,
      waits,
    }));
  };

  return {
    listeners,
    showNotification,
    skipWaiting,
    claim,
    matchAll,
    openWindow,
    dispatch,
    push,
    click,
  };
}

const withJson = (text: string): FakeEvent["data"] => ({ json: () => JSON.parse(text) as unknown });

/** What the worker must show for a message it accepts. */
const shownFor = (m: PushMessage): [string, unknown] => [
  m.title,
  {
    body: m.body,
    tag: m.tag,
    renotify: m.renotify,
    icon: "/icon",
    badge: "/push-badge",
    data: { url: m.url },
    lang: "en",
  },
];
const FALLBACK_SHOWN: [string, unknown] = [FALLBACK_TITLE, FALLBACK_OPTIONS];

describe("worker lifecycle", () => {
  it("takes over at once and has no fetch handler, so nothing is ever cached", async () => {
    const w = loadWorker();
    expect([...w.listeners.keys()].sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
    expect(w.listeners.has("fetch")).toBe(false);
    await w.dispatch("install", {});
    expect(w.skipWaiting).toHaveBeenCalledOnce();
    await w.dispatch("activate", {});
    expect(w.claim).toHaveBeenCalledOnce();
  });

  it("does not use fetch or caches anywhere in the script", () => {
    expect(SOURCE).not.toMatch(/\bfetch\b|\bcaches\b|importScripts/);
  });
});

describe("push: every domain builder's output", () => {
  const ME = "user-me";
  const OTHER = "user-other";
  const longName = "N".repeat(80);
  const post = { id: "msg-1", authorId: OTHER as string | null, deleted: false };
  const scoreItem = (name: string): ScoreUpdateItem => ({
    teamSlug: "team-a",
    teamName: "team-a",
    participantName: name,
    sport: "nfl",
    pointsDelta: 2.5,
  });

  const messages: [string, () => PushMessage[]][] = [
    [
      "trade",
      () => [
        tradePushAlert({
          recipientId: OTHER,
          listingId: "lst-1",
          offerId: "off-1",
          eventKey: "accepted",
          title: "Papie accepted your offer",
          body: "Papie accepted your offer. You now have the Bears.",
        }).message,
      ],
    ],
    [
      "reply",
      () => [
        replyPushAlert({
          actorId: ME,
          replyId: "r",
          parent: { id: "p", authorId: OTHER },
          replierName: longName,
          replyBody: "Nice one",
        })?.message ?? fail(),
      ],
    ],
    [
      "reply with a 160 emoji body",
      () => [
        replyPushAlert({
          actorId: ME,
          replyId: "r",
          parent: { id: "p", authorId: OTHER },
          replierName: "😀".repeat(30),
          replyBody: "🔥".repeat(160),
        })?.message ?? fail(),
      ],
    ],
    [
      "reaction, single",
      () => [
        reactionPushAlert({
          actorId: ME,
          actorName: longName,
          reaction: "goat",
          message: { ...post, body: "Anyone want a trade?" },
          reactorIds: [ME],
        })?.message ?? fail(),
      ],
    ],
    [
      "reaction, emoji-heavy name and 12 other reactors",
      () => [
        reactionPushAlert({
          actorId: ME,
          actorName: "😀".repeat(30),
          reaction: "skull",
          message: { ...post, body: "🔥".repeat(300) },
          reactorIds: [ME, ...Array.from({ length: 12 }, (_, i) => `r${i}`)],
        })?.message ?? fail(),
      ],
    ],
    [
      "score",
      () =>
        scorePushAlerts({
          runId: "run",
          items: ["A", "B", "C", "D", "E"].map((n) => scoreItem(`${n} ${longName}`)),
          teams: [{ slug: "team-a", name: longName, ownerId: "owner-a" }],
        }).map((a) => a.message),
    ],
    [
      "test alert",
      () => [testPushAlert({ recipientId: ME, now: new Date("2026-09-29T10:15:00Z") }).message],
    ],
  ];

  function fail(): never {
    throw new Error("builder returned no alert");
  }

  it.each(messages)("%s is shown exactly as built, never the fallback", async (_name, build) => {
    const built = build();
    expect(built.length).toBeGreaterThan(0);
    for (const message of built) {
      const w = loadWorker();
      const waits = await w.push(withJson(encodePushPayload(message)));
      expect(waits).toBe(1);
      expect(w.showNotification).toHaveBeenCalledOnce();
      expect(w.showNotification.mock.calls[0]).toEqual(shownFor(message));
      expect(message.title).not.toBe(FALLBACK_TITLE);
    }
  });
});

/** A message the worker accepts, to change one field at a time. */
const valid = {
  v: 1,
  title: "Papie wants to trade with you",
  body: "Papie offered the Chiefs for your Bears.",
  url: "/trades/lst-1",
  tag: "trade-lst-1",
  renotify: true,
};
const raw = (over: Record<string, unknown>) => JSON.stringify({ ...valid, ...over });
const without = (key: keyof typeof valid) =>
  JSON.stringify(Object.fromEntries(Object.entries(valid).filter(([k]) => k !== key)));

// [label, JSON text, does the schema accept it]. The flag pins the intent, so the contract test
// below cannot pass by both sides drifting the same way.
const PAYLOADS: [string, string, boolean][] = [
  ["a valid message", JSON.stringify(valid), true],
  ["extra keys are ignored", raw({ extra: 1, icon: "https://evil.test/x.png" }), true],
  ["bad JSON", "{not json", false],
  ["an empty string", "", false],
  ["null", "null", false],
  ["an array holding a valid message", `[${JSON.stringify(valid)}]`, false],
  ["an empty array", "[]", false],
  ["a string", '"hello"', false],
  ["a number", "42", false],
  ["a boolean", "true", false],
  ["version 2", raw({ v: 2 }), false],
  ["version as a string", raw({ v: "1" }), false],
  ["version missing", without("v"), false],
  ["title empty", raw({ title: "" }), false],
  ["title of 80 characters", raw({ title: "x".repeat(80) }), true],
  ["title of 81 characters", raw({ title: "x".repeat(81) }), false],
  ["title of 80 emoji", raw({ title: "🔥".repeat(80) }), true],
  ["title of 81 emoji", raw({ title: "🔥".repeat(81) }), false],
  ["title of one lone surrogate", raw({ title: "\uD83D" }), true],
  ["title not a string", raw({ title: 5 }), false],
  ["title missing", without("title"), false],
  ["body empty", raw({ body: "" }), true],
  ["body of 200 characters", raw({ body: "x".repeat(200) }), true],
  ["body of 201 characters", raw({ body: "x".repeat(201) }), false],
  ["body of 200 emoji", raw({ body: "🔥".repeat(200) }), true],
  ["body of 201 emoji", raw({ body: "🔥".repeat(201) }), false],
  ["body not a string", raw({ body: null }), false],
  ["body missing", without("body"), false],
  ["url of the home page", raw({ url: "/" }), true],
  ["url with query and hash", raw({ url: "/trades/abc?x=1#y" }), true],
  ["url with an encoded slash", raw({ url: "/a%2F%2Fb" }), true],
  ["url //evil", raw({ url: "//evil.com" }), false],
  ["url /\\evil", raw({ url: "/\\evil.com" }), false],
  ["url /<tab>/x", raw({ url: "/\t/x" }), false],
  ["url /<newline>/x", raw({ url: "/\n/x" }), false],
  ["url with a space", raw({ url: "/a b" }), false],
  ["url with a NUL", raw({ url: "/a\u0000b" }), false],
  ["url with DEL", raw({ url: "/a\u007Fb" }), false],
  ["url with a C1 control", raw({ url: "/a\u0085b" }), false],
  ["url with a line separator", raw({ url: "/a b" }), false],
  ["url with a backslash inside", raw({ url: "/a\\b" }), false],
  ["url absolute https", raw({ url: "https://evil.com/" }), false],
  ["url javascript:", raw({ url: "javascript:alert(1)" }), false],
  ["url without a leading slash", raw({ url: "trades" }), false],
  ["url empty", raw({ url: "" }), false],
  ["url of 300 characters", raw({ url: `/${"a".repeat(299)}` }), true],
  ["url of 301 characters", raw({ url: `/${"a".repeat(300)}` }), false],
  ["url of 300 emoji code points", raw({ url: `/${"🔥".repeat(299)}` }), true],
  ["url of 301 emoji code points", raw({ url: `/${"🔥".repeat(300)}` }), false],
  ["url not a string", raw({ url: 7 }), false],
  ["url missing", without("url"), false],
  ["tag missing", without("tag"), false],
  ["tag empty", raw({ tag: "" }), false],
  ["tag of 64 characters", raw({ tag: "t".repeat(64) }), true],
  ["tag of 65 characters", raw({ tag: "t".repeat(65) }), false],
  ["tag with allowed punctuation", raw({ tag: "feed:replies_p-1" }), true],
  ["tag with a space", raw({ tag: "bad tag" }), false],
  ["tag with a slash", raw({ tag: "a/b" }), false],
  ["tag with a letter outside ASCII", raw({ tag: "café" }), false],
  ["tag with a trailing newline", raw({ tag: "tag\n" }), false],
  ["tag not a string", raw({ tag: 1 }), false],
  ["renotify false", raw({ renotify: false }), true],
  ["renotify as a string", raw({ renotify: "true" }), false],
  ["renotify as a number", raw({ renotify: 1 }), false],
  ["renotify null", raw({ renotify: null }), false],
  ["renotify missing", without("renotify"), false],
];

function schemaAccepts(text: string): boolean {
  try {
    return pushPayloadSchema.safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}

describe("push: contract with pushPayloadSchema", () => {
  it("covers both outcomes and pins the schema's own answer for each case", () => {
    expect(PAYLOADS.some(([, , ok]) => ok)).toBe(true);
    expect(PAYLOADS.some(([, , ok]) => !ok)).toBe(true);
    for (const [label, text, expected] of PAYLOADS) {
      expect(schemaAccepts(text), label).toBe(expected);
    }
  });

  it.each(PAYLOADS)("%s: the worker and the schema agree", async (_label, text) => {
    const w = loadWorker();
    const waits = await w.push(withJson(text));
    // Never silent, whatever the payload.
    expect(waits).toBe(1);
    expect(w.showNotification).toHaveBeenCalledOnce();
    const shown = w.showNotification.mock.calls[0];
    if (schemaAccepts(text)) {
      const message = JSON.parse(text) as PushMessage;
      expect(shown).toEqual(shownFor(message));
    } else {
      expect(shown).toEqual(FALLBACK_SHOWN);
    }
  });

  it("shows the fallback when the push carries no data at all", async () => {
    const w = loadWorker();
    expect(await w.push(null)).toBe(1);
    expect(w.showNotification.mock.calls[0]).toEqual(FALLBACK_SHOWN);
    const w2 = loadWorker();
    expect(await w2.push(undefined)).toBe(1);
    expect(w2.showNotification.mock.calls[0]).toEqual(FALLBACK_SHOWN);
  });

  it("shows the fallback when reading the data throws something other than a SyntaxError", async () => {
    const w = loadWorker();
    await w.push({
      json: () => {
        throw new Error("boom");
      },
    });
    expect(w.showNotification.mock.calls[0]).toEqual(FALLBACK_SHOWN);
  });
});

describe("notificationclick", () => {
  it("focuses and navigates an existing window of this site", async () => {
    const open = client(`${ORIGIN}/rules`);
    const order: string[] = [];
    open.focus.mockImplementation(() => {
      order.push("focus");
      return Promise.resolve();
    });
    open.navigate.mockImplementation(() => {
      order.push("navigate");
      return Promise.resolve();
    });
    const w = loadWorker([client("https://evil.test/", {}), open]);
    const { close, waits } = await w.click({ url: "/trades/lst-1" });
    expect(waits).toBe(1);
    expect(close).toHaveBeenCalledOnce();
    expect(w.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(order).toEqual(["focus", "navigate"]);
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/trades/lst-1`);
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when there is none", async () => {
    const w = loadWorker([]);
    const { close } = await w.click({ url: "/feed" });
    expect(close).toHaveBeenCalledOnce();
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/feed`);
  });

  it("ignores windows of other sites", async () => {
    const foreign = client("https://evil.test/");
    const w = loadWorker([foreign]);
    await w.click({ url: "/feed" });
    expect(foreign.focus).not.toHaveBeenCalled();
    expect(foreign.navigate).not.toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/feed`);
  });

  it("opens a window when navigate is refused", async () => {
    const open = client(`${ORIGIN}/`, { navigate: vi.fn(() => Promise.reject(new Error("no"))) });
    const w = loadWorker([open]);
    await w.click({ url: "/feed" });
    expect(open.focus).toHaveBeenCalledOnce();
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/feed`);
  });

  it("opens a window when focus is refused", async () => {
    const open = client(`${ORIGIN}/`, { focus: vi.fn(() => Promise.reject(new Error("no"))) });
    const w = loadWorker([open]);
    await w.click({ url: "/feed" });
    expect(open.navigate).not.toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/feed`);
  });

  it("opens a window when the client list cannot be read", async () => {
    const w = loadWorker();
    w.matchAll.mockImplementation(() => Promise.reject(new Error("no")));
    await w.click({ url: "/feed" });
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/feed`);
  });

  it.each([
    ["//evil.com", { url: "//evil.com" }],
    ["/\\evil.com", { url: "/\\evil.com" }],
    ["/<tab>/evil.com", { url: "/\t/evil.com" }],
    ["an absolute off-origin url", { url: "https://evil.com/x" }],
    ["javascript:", { url: "javascript:alert(1)" }],
    ["an over-long path", { url: `/${"a".repeat(300)}` }],
    ["a url that is not a string", { url: 5 }],
    ["data without a url", {}],
    ["null data", null],
    ["undefined data", undefined],
  ])("sends %s to the home page", async (_label, data) => {
    const existing = client(`${ORIGIN}/rules`);
    const withClient = loadWorker([existing]);
    await withClient.click(data);
    expect(existing.navigate).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/`);
    const bare = loadWorker([]);
    await bare.click(data);
    expect(bare.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/`);
  });
});
