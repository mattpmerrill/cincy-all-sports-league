import { describe, expect, it } from "vitest";
import { newOfferEmail } from "@/domain/trades/emails";
import type { TradeAlert } from "./trade-alerts";
import { toTradePushAlerts } from "./trade-push";

const NOTE = "call me before you say no";

const participant = (id: string, name: string) => ({
  id,
  name,
  shortName: name,
  logoUrl: null,
  primaryColor: null,
});
const legs = [
  {
    sport: "nfl" as const,
    gives: participant("p1", "Utah Utes"),
    gets: participant("p2", "Chicago Bears"),
  },
];

/** Built by the real email builder, so the test notices if the note ever moves into `lines[0]`. */
const offerAlert = (over: Partial<TradeAlert> = {}): TradeAlert => ({
  event: "new_offer",
  recipientId: "u1",
  listingId: "l1",
  offerId: "o1",
  content: newOfferEmail({ offerKind: "direct", from: "Sam", legs, note: NOTE }),
  ...over,
});

describe("toTradePushAlerts", () => {
  it("maps the subject and first line to a trade alert with a stable key, tag and link", () => {
    const [pushed] = toTradePushAlerts([offerAlert({ event: "accepted", offerId: "o9" })]);
    expect(pushed).toMatchObject({
      topic: "trades",
      recipientId: "u1",
      dedupeKey: "trade:o9:accepted",
      message: { title: "Sam wants to trade with you", url: "/trades/l1", tag: "trade-l1" },
    });
    expect(pushed?.message.body).toContain("Sam offered");
  });

  it("never carries the member's free-text note anywhere in the alert", () => {
    const email = offerAlert().content;
    // Guard the fixture: the real email does carry the note, just not in its first line.
    expect(email.lines.join(" ")).toContain(NOTE);
    expect(email.lines[0]).not.toContain(NOTE);

    expect(JSON.stringify(toTradePushAlerts([offerAlert()]))).not.toContain(NOTE);
  });

  it("keeps each alert's own recipient, event and offer, in input order", () => {
    const pushed = toTradePushAlerts([
      offerAlert({ recipientId: "owner", event: "new_offer", offerId: "o1" }),
      offerAlert({ recipientId: "offerer", event: "rejected", offerId: "o2", listingId: "l2" }),
    ]);
    expect(pushed.map((p) => [p.recipientId, p.dedupeKey, p.message.url])).toEqual([
      ["owner", "trade:o1:new_offer", "/trades/l1"],
      ["offerer", "trade:o2:rejected", "/trades/l2"],
    ]);
  });
});
