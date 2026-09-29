import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, parseLeaguePayload } from "@/domain/feed";
import { participant } from "./fixtures";
import { tradeCompletedPost, tradeListedPost, tradeOfferPost } from "./posts";

const coop = { name: "Coop Doggies", slug: "coop-doggies" };
const papie = { name: "Papie", slug: "papie" };
const bears = participant("Chicago Bears");
const celtics = participant("Boston Celtics");
const chiefs = participant("Kansas City Chiefs");
const lakers = participant("Lakers");

/** The database function adds the listing id; parsing what it stored must give the payload back. */
const stored = (payload: object) => parseLeaguePayload({ ...payload, listingId: "l1" });

describe("tradeListedPost", () => {
  const post = tradeListedPost({
    team: coop,
    items: [
      { sport: "nba", participant: celtics },
      { sport: "nfl", participant: bears },
    ],
  });

  it("names every player with its league, in catalog order", () => {
    expect(post.body).toBe(
      "Coop Doggies put Boston Celtics (NBA) and Chicago Bears (NFL) on the trading block.",
    );
  });

  it("builds a payload without listingId that round-trips once it is injected", () => {
    expect(post.payload).not.toHaveProperty("listingId");
    expect(stored(post.payload)).toEqual({ ...post.payload, listingId: "l1" });
  });

  it("stays inside the feed limit for a long list", () => {
    const many = tradeListedPost({
      team: coop,
      items: (
        [
          "mlb",
          "nba",
          "nhl",
          "ncaaf",
          "ncaab",
          "ncaasb",
          "wta",
          "mls",
          "pga",
          "wnba",
          "nfl",
        ] as const
      ).map((sport) => ({
        sport,
        participant: participant(`A very long participant name for ${sport} number one`),
      })),
    });
    expect(many.body.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
    expect(many.payload.items).toHaveLength(11);
  });
});

describe("tradeOfferPost", () => {
  const legs = [{ sport: "nfl" as const, gives: chiefs, gets: bears }];

  it("says offered for a direct offer", () => {
    const post = tradeOfferPost({ offerKind: "direct", from: papie, to: coop, legs });
    expect(post.body).toBe(
      "Papie offered Kansas City Chiefs (NFL) for Coop Doggies' Chicago Bears.",
    );
    expect(post.payload).toMatchObject({ offerKind: "direct", note: null });
  });

  it("says competing offer for an offer on an open listing, and adds the note", () => {
    const post = tradeOfferPost({
      offerKind: "competing",
      from: coop,
      to: papie,
      legs: [
        { sport: "nba", gives: celtics, gets: lakers },
        { sport: "nfl", gives: bears, gets: chiefs },
      ],
      note: "  Two   for two,\nfair?  ",
    });
    expect(post.body).toBe(
      "Coop Doggies made a competing offer: Boston Celtics (NBA) and Chicago Bears (NFL) for Papie's Lakers and Kansas City Chiefs. " +
        'Note: "Two for two, fair?"',
    );
    expect(post.payload.note).toBe("Two for two, fair?");
    expect(stored(post.payload)).toEqual({ ...post.payload, listingId: "l1" });
  });

  it("shortens a note that would push the body past the limit, keeping the whole payload note", () => {
    const note = "word ".repeat(200).trim();
    const post = tradeOfferPost({ offerKind: "direct", from: papie, to: coop, legs, note });
    expect(post.body.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
    expect(post.body).toMatch(/Note: "word( word)*…"$/);
    expect(post.payload.note).toBe(note);
  });

  it("uses no em dashes", () => {
    expect(tradeOfferPost({ offerKind: "direct", from: papie, to: coop, legs }).body).not.toMatch(
      /—/,
    );
  });
});

describe("tradeCompletedPost", () => {
  const post = tradeCompletedPost({
    owner: coop,
    offerer: papie,
    legs: [{ sport: "nfl", ownerGave: bears, offererGave: chiefs }],
  });

  it("reads like a score line", () => {
    expect(post.body).toBe(
      "Trade done: Coop Doggies send Chicago Bears (NFL) to Papie for Kansas City Chiefs.",
    );
  });

  it("round-trips through the feed schema", () => {
    expect(stored(post.payload)).toEqual({ ...post.payload, listingId: "l1" });
  });
});

describe("trade payloads in the feed schema", () => {
  it("requires the listing id the database injects", () => {
    const { payload } = tradeListedPost({
      team: coop,
      items: [{ sport: "nfl", participant: bears }],
    });
    expect(parseLeaguePayload(payload)).toBeNull();
  });

  it("still falls back to null for unknown or malformed shapes", () => {
    expect(parseLeaguePayload({ type: "trade_cancelled", listingId: "l1" })).toBeNull();
    expect(
      parseLeaguePayload({
        type: "trade_listed",
        listingId: "l1",
        team: coop,
        items: [{ sport: "curling", participantName: "x" }],
      }),
    ).toBeNull();
    expect(parseLeaguePayload({ type: "trade_offer", listingId: "l1" })).toBeNull();
  });
});
