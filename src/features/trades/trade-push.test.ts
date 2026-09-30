import { describe, expect, it } from "vitest";
import type { TradeAlert } from "./trade-alerts";
import { toTradePushAlerts } from "./trade-push";

const alert = (over: Partial<TradeAlert> = {}): TradeAlert => ({
  event: "new_offer",
  recipientId: "u1",
  listingId: "l1",
  offerId: "o1",
  content: {
    subject: "Sam wants to trade with you",
    lines: [
      "Sam offered Utah Utes for your Chicago Bears.",
      "Secret note: call me before you say no.",
    ],
  },
  ...over,
});

describe("toTradePushAlerts", () => {
  it("maps the subject and first line to a trade alert with a stable key, tag and link", () => {
    const [pushed] = toTradePushAlerts([alert({ event: "accepted", offerId: "o9" })]);
    expect(pushed).toMatchObject({
      topic: "trades",
      recipientId: "u1",
      dedupeKey: "trade:o9:accepted",
      message: {
        title: "Sam wants to trade with you",
        body: "Sam offered Utah Utes for your Chicago Bears.",
        url: "/trades/l1",
        tag: "trade-l1",
      },
    });
  });

  it("never carries the member's free-text note", () => {
    const pushed = toTradePushAlerts([alert()]);
    expect(JSON.stringify(pushed)).not.toContain("Secret note");
  });

  it("keeps one alert per email alert, in order", () => {
    const pushed = toTradePushAlerts([alert({ recipientId: "a" }), alert({ recipientId: "b" })]);
    expect(pushed.map((p) => p.recipientId)).toEqual(["a", "b"]);
  });
});
