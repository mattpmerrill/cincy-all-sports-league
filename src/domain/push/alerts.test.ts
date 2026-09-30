import { describe, expect, it } from "vitest";
import type { ScoreUpdateItem } from "@/domain/feed";
import { TRADE_WINDOW_HOURS } from "@/domain/trades";
import {
  reactionPushAlert,
  replyPushAlert,
  scorePushAlerts,
  testPushAlert,
  tradePushAlert,
} from "./alerts";
import { MAX_PAYLOAD_BYTES, encodePushPayload, pushPayloadSchema } from "./payload";
import type { PushAlert, PushSend } from "./types";

const ME = "user-me";
const OTHER = "user-other";

const post = (over: Partial<{ authorId: string | null; deleted: boolean }> = {}) => ({
  id: "msg-1",
  authorId: OTHER as string | null,
  body: "Anyone want a trade?",
  deleted: false,
  ...over,
});

const item = (teamSlug: string, participantName: string, pointsDelta: number): ScoreUpdateItem => ({
  teamSlug,
  teamName: teamSlug,
  participantName,
  sport: "nfl",
  pointsDelta,
});

const teams = [
  { slug: "team-a", name: "Team A", ownerId: "owner-a" },
  { slug: "team-b", name: "Team B", ownerId: "owner-b" },
  { slug: "team-free", name: "Nobody's Team", ownerId: null },
];

describe("tradePushAlert", () => {
  it("links to the listing, replaces older alerts for it and lives as long as the trade window", () => {
    const alert = tradePushAlert({
      recipientId: OTHER,
      listingId: "lst-1",
      offerId: "off-1",
      eventKey: "new_offer",
      title: "Papie wants to trade with you",
      body: "Papie offered the Chiefs for your Bears.",
    });
    expect(alert).toMatchObject({
      topic: "trades",
      recipientId: OTHER,
      dedupeKey: "trade:off-1:new_offer",
      ttlSeconds: TRADE_WINDOW_HOURS * 3600,
      urgency: "high",
      message: { url: "/trades/lst-1", tag: "trade-lst-1", renotify: true },
    });
  });
});

describe("replyPushAlert", () => {
  const reply = (over: Partial<Parameters<typeof replyPushAlert>[0]> = {}) =>
    replyPushAlert({
      actorId: ME,
      replyId: "rep-1",
      parent: { id: "msg-1", authorId: OTHER },
      replierName: "Matt",
      replyBody: "Count me in",
      ...over,
    });

  it("tells the author of the post", () => {
    expect(reply()).toMatchObject({
      topic: "feed",
      recipientId: OTHER,
      dedupeKey: "reply:rep-1",
      message: { title: "Matt replied to your post", body: "Count me in", url: "/feed" },
    });
  });

  it("never tells the actor about their own reply", () => {
    expect(reply({ parent: { id: "msg-1", authorId: ME } })).toBeNull();
  });

  it("tells nobody about a reply to a league post", () => {
    expect(reply({ parent: { id: "msg-1", authorId: null } })).toBeNull();
  });

  it("keeps the verb when the replier has a very long name", () => {
    const title = reply({ replierName: "M".repeat(200) })?.message.title;
    expect(title).toMatch(/replied to your post$/);
  });
});

describe("reactionPushAlert", () => {
  const react = (over: Partial<Parameters<typeof reactionPushAlert>[0]> = {}) =>
    reactionPushAlert({
      actorId: ME,
      actorName: "Matt",
      reaction: "fire",
      message: post(),
      reactorIds: [ME],
      ...over,
    });

  it("tells the author, quoting the post", () => {
    expect(react()).toMatchObject({
      recipientId: OTHER,
      dedupeKey: `reaction:msg-1:${ME}`,
      message: {
        title: "Matt reacted 🔥 to your post",
        body: '"Anyone want a trade?"',
        tag: "feed-reactions-msg-1",
        renotify: false,
      },
    });
  });

  it("groups by count once others have reacted", () => {
    expect(react({ reactorIds: [ME, "r2"] })?.message.title).toBe(
      "Matt and 1 other reacted to your post",
    );
    expect(react({ reactorIds: [ME, "r2", "r3", "r4"] })?.message.title).toBe(
      "Matt and 3 others reacted to your post",
    );
  });

  it("counts distinct reactors, leaving out the author and the actor", () => {
    const title = (reactorIds: string[]) => react({ reactorIds })?.message.title;
    // Duplicates (one member, several emoji) count once; the author's own reaction never counts.
    expect(title([ME, "r2", "r2", OTHER, "r3", "r3"])).toBe(
      "Matt and 2 others reacted to your post",
    );
    expect(title([ME, OTHER, ME])).toBe("Matt reacted 🔥 to your post");
    expect(title([])).toBe("Matt reacted 🔥 to your post");
  });

  it("clips the quoted snippet to 100 characters", () => {
    const body = react({ message: { ...post(), body: "w".repeat(300) } })?.message.body;
    expect(Array.from(body ?? "")).toHaveLength(102);
    expect(body?.endsWith('…"')).toBe(true);
  });

  it("never tells the actor about their own post", () => {
    expect(react({ message: post({ authorId: ME }) })).toBeNull();
  });

  it("tells nobody about a league post or a deleted post", () => {
    expect(react({ message: post({ authorId: null }) })).toBeNull();
    expect(react({ message: post({ deleted: true }) })).toBeNull();
  });
});

describe("scorePushAlerts", () => {
  const run = (items: ScoreUpdateItem[], t = teams) =>
    scorePushAlerts({ runId: "run-1", items, teams: t });

  it("sends one alert per owned team, with its own total and link", () => {
    const alerts = run([
      item("team-a", "Chicago Bears", 3),
      item("team-a", "Utah Utes", 4.5),
      item("team-b", "Chicago Bears", 3),
      item("team-free", "Kansas City Chiefs", 9),
    ]);
    expect(alerts.map((a) => a.recipientId)).toEqual(["owner-a", "owner-b"]);
    expect(alerts[0]).toMatchObject({
      topic: "scores",
      dedupeKey: "score:run-1:team-a",
      ttlSeconds: 6 * 3600,
      message: {
        title: "Team A +7.5",
        body: "Utah Utes +4.5, Chicago Bears +3",
        url: "/teams/team-a",
        tag: "scores-team-a",
      },
    });
    expect(alerts[1]?.message.title).toBe("Team B +3");
  });

  it("tells both owners when two teams hold the same participant (WNBA)", () => {
    const alerts = run([item("team-a", "Las Vegas Aces", 2), item("team-b", "Las Vegas Aces", 2)]);
    expect(alerts.map((a) => a.recipientId)).toEqual(["owner-a", "owner-b"]);
    expect(alerts.map((a) => a.message.body)).toEqual(["Las Vegas Aces +2", "Las Vegas Aces +2"]);
  });

  it("counts gains only and stays silent for a team that only lost points", () => {
    const alerts = run([
      item("team-a", "Chicago Bears", 3),
      item("team-a", "Utah Utes", -5),
      item("team-a", "Detroit Lions", 0),
      item("team-b", "Utah Utes", -2),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).toMatchObject({ title: "Team A +3", body: "Chicago Bears +3" });
  });

  it("names the top three gainers and counts the rest", () => {
    const alerts = run([
      item("team-a", "E", 1),
      item("team-a", "B", 5),
      item("team-a", "D", 2),
      item("team-a", "A", 5),
      item("team-a", "C", 3),
    ]);
    // Ties on points fall back to name so the order never depends on input order.
    expect(alerts[0]?.message.body).toBe("A +5, B +5, C +3 and 2 more");
    expect(alerts[0]?.message.title).toBe("Team A +16");
  });

  it("formats points like the rest of the app and sums without float noise", () => {
    const alerts = run([
      item("team-a", "A", 0.1),
      item("team-a", "B", 0.2),
      item("team-a", "C", 12),
    ]);
    expect(alerts[0]?.message.title).toBe("Team A +12.3");
    expect(alerts[0]?.message.body).toBe("C +12, B +0.2, A +0.1");
  });

  it("sums in exact units, so 0.1 + 0.2 reads +0.3", () => {
    const alerts = run([item("team-a", "A", 0.1), item("team-a", "B", 0.2)]);
    expect(alerts[0]?.message.title).toBe("Team A +0.3");
  });

  it("sends nothing for a run with no gains", () => {
    expect(run([])).toEqual([]);
  });
});

describe("testPushAlert", () => {
  it("has no topic, so no switch can filter it, and makes no promise about topics", () => {
    const alert = testPushAlert({ recipientId: ME, now: new Date("2026-09-29T10:15:00Z") });
    expect(alert).not.toHaveProperty("topic");
    expect(alert.message).toMatchObject({ title: "Alerts are working", url: "/me", tag: "test" });
    expect(alert.message.body).toBe("Alerts are working on this device.");
  });
});

describe("dedupe keys", () => {
  it("are stable across calls, so a re-run of the same event sends nothing twice", () => {
    const reactInput: Parameters<typeof reactionPushAlert>[0] = {
      actorId: ME,
      actorName: "Matt",
      reaction: "fire",
      message: post(),
      reactorIds: [ME],
    };
    // Another reactor joining changes the wording but must not change the key.
    expect(reactionPushAlert(reactInput)?.dedupeKey).toBe(
      reactionPushAlert({ ...reactInput, reactorIds: [ME, "a", "b", "c", "d"] })?.dedupeKey,
    );
    const score = { runId: "run-9", items: [item("team-a", "A", 1)], teams };
    expect(scorePushAlerts(score)[0]?.dedupeKey).toBe(scorePushAlerts(score)[0]?.dedupeKey);
  });

  it("throttles the test alert to one per minute", () => {
    const at = (iso: string) => testPushAlert({ recipientId: ME, now: new Date(iso) }).dedupeKey;
    expect(at("2026-09-29T10:15:01Z")).toBe(at("2026-09-29T10:15:59Z"));
    expect(at("2026-09-29T10:15:59Z")).not.toBe(at("2026-09-29T10:16:00Z"));
  });
});

describe("every builder's output", () => {
  const longName = "N".repeat(80);
  const cases: [string, () => PushAlert | PushSend | null | PushAlert[]][] = [
    [
      "tradePushAlert",
      () =>
        tradePushAlert({
          recipientId: OTHER,
          listingId: "lst-1",
          offerId: "off-1",
          eventKey: "accepted",
          title: "Papie accepted your offer",
          body: "Papie accepted your offer. You now have the Bears.",
        }),
    ],
    [
      "replyPushAlert",
      () =>
        replyPushAlert({
          actorId: ME,
          replyId: "r",
          parent: { id: "p", authorId: OTHER },
          replierName: longName,
          replyBody: "Nice one",
        }),
    ],
    [
      "reactionPushAlert (single)",
      () =>
        reactionPushAlert({
          actorId: ME,
          actorName: longName,
          reaction: "goat",
          message: post(),
          reactorIds: [ME],
        }),
    ],
    [
      "reactionPushAlert (grouped)",
      () =>
        reactionPushAlert({
          actorId: ME,
          actorName: "Matt",
          reaction: "goat",
          message: post(),
          reactorIds: [ME, "r2", "r3"],
        }),
    ],
    [
      "reactionPushAlert (emoji-heavy name and 12 other reactors)",
      () =>
        reactionPushAlert({
          actorId: ME,
          actorName: "😀".repeat(30),
          reaction: "skull",
          message: { ...post(), body: "🔥".repeat(300) },
          reactorIds: [ME, ...Array.from({ length: 12 }, (_, i) => `r${i}`)],
        }),
    ],
    [
      "replyPushAlert (160 emoji body)",
      () =>
        replyPushAlert({
          actorId: ME,
          replyId: "r",
          parent: { id: "p", authorId: OTHER },
          replierName: "😀".repeat(30),
          replyBody: "🔥".repeat(160),
        }),
    ],
    [
      "scorePushAlerts",
      () =>
        scorePushAlerts({
          runId: "run",
          items: ["A", "B", "C", "D", "E"].map((n) => item("team-a", `${n} ${longName}`, 2.5)),
          teams: [{ slug: "team-a", name: longName, ownerId: "owner-a" }],
        }),
    ],
    [
      "testPushAlert",
      () => testPushAlert({ recipientId: ME, now: new Date("2026-09-29T10:15:00Z") }),
    ],
  ];

  it.each(cases)(
    "%s has no em dash, passes the worker's schema and fits the byte cap",
    (_name, build) => {
      const built = build();
      const alerts = Array.isArray(built) ? built : built ? [built] : [];
      expect(alerts.length).toBeGreaterThan(0);
      for (const { message } of alerts) {
        expect(Object.values(message).join("\n")).not.toMatch(/[–—]/);
        const json = encodePushPayload(message);
        expect(pushPayloadSchema.safeParse(JSON.parse(json)).success).toBe(true);
        expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      }
    },
  );
});
