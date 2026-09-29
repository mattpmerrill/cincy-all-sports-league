import { describe, expect, it, vi } from "vitest";
import { tradeCompletedPost, tradeListedPost } from "@/domain/trades";
import type { DbClient } from "./db-client";
import {
  createTradesRepository,
  toOfferWithListing,
  toTradeError,
  toTradeListing,
} from "./trades.repository";
import type { ListingRow, OfferWithListingRow } from "./trades.repository";

const participant = (id: string, sport: string, name = id) => ({
  id,
  name,
  short_name: name,
  logo_url: null,
  primary_color: null,
  sports: { code: sport },
});
const team = (id: string, ownerName: string | null) => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  profiles: ownerName ? { id: `${id}-u`, display_name: ownerName, avatar_url: null } : null,
});

const offer = (id: string, createdAt: string, legs: ReturnType<typeof participant>[]) => ({
  id,
  listing_id: "l1",
  note: null,
  status: "pending" as const,
  created_at: createdAt,
  resolved_at: null,
  fantasy_teams: team("papie", "Pat"),
  trade_offer_legs: legs.map((participants) => ({ participants })),
});

// Embedded rows arrive in no particular order, which the mappers must not depend on.
const listingRow: ListingRow = {
  id: "l1",
  kind: "block",
  status: "open",
  created_by: "u1",
  created_at: "2026-09-29T10:00:00Z",
  closes_at: "2026-09-30T10:00:00Z",
  resolved_at: null,
  accepted_offer_id: null,
  fantasy_teams: team("coop", "Cooper"),
  trade_listing_items: [
    { participants: participant("celtics", "nba", "Boston Celtics") },
    { participants: participant("bears", "nfl", "Chicago Bears") },
    { participants: participant("cubs", "mlb", "Chicago Cubs") },
  ],
  trade_offers: [
    offer("o2", "2026-09-29T12:00:00Z", [participant("lakers", "nba")]),
    offer("o1", "2026-09-29T11:00:00Z", [participant("chiefs", "nfl"), participant("mets", "mlb")]),
  ],
};

describe("toTradeListing", () => {
  const listing = toTradeListing(listingRow);

  it("maps the row to the domain read model with camelCase fields", () => {
    expect(listing).toMatchObject({
      id: "l1",
      kind: "block",
      status: "open",
      createdBy: "u1",
      closesAt: "2026-09-30T10:00:00Z",
      acceptedOfferId: null,
      ownerTeam: { id: "coop", slug: "coop", name: "COOP", owner: { displayName: "Cooper" } },
    });
    expect(listing.items[0]?.participant).toMatchObject({ id: "cubs", shortName: "Chicago Cubs" });
  });

  it("orders items and legs by the sport catalog and offers oldest first", () => {
    expect(listing.items.map((i) => i.sport)).toEqual(["mlb", "nba", "nfl"]);
    expect(listing.offers.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(listing.offers[0]?.legs.map((l) => l.sport)).toEqual(["mlb", "nfl"]);
    expect(listing.offers[0]).toMatchObject({ listingId: "l1", offeringTeam: { slug: "papie" } });
  });

  it("keeps an unowned team's owner as null", () => {
    const row = { ...listingRow, fantasy_teams: team("coop", null) };
    expect(toTradeListing(row).ownerTeam.owner).toBeNull();
  });

  it("fails loudly on a sport code the catalog doesn't know", () => {
    const row = {
      ...listingRow,
      trade_listing_items: [{ participants: participant("x", "curling") }],
    };
    expect(() => toTradeListing(row)).toThrow(/curling/);
  });
});

describe("toOfferWithListing", () => {
  it("nests the listing without its offers", () => {
    const row: OfferWithListingRow = {
      ...offer("o1", "2026-09-29T11:00:00Z", [participant("chiefs", "nfl")]),
      trade_listings: {
        id: "l1",
        kind: "direct",
        status: "accepted",
        created_by: null,
        created_at: "2026-09-29T10:00:00Z",
        closes_at: "2026-09-30T10:00:00Z",
        resolved_at: "2026-09-29T13:00:00Z",
        accepted_offer_id: "o1",
        fantasy_teams: team("coop", "Cooper"),
        trade_listing_items: [{ participants: participant("bears", "nfl") }],
      },
    };
    const mapped = toOfferWithListing(row);
    expect(mapped.legs).toHaveLength(1);
    expect(mapped.listing).toMatchObject({ id: "l1", kind: "direct", acceptedOfferId: "o1" });
    expect(mapped.listing).not.toHaveProperty("offers");
  });
});

describe("toTradeError", () => {
  const raised = (message: string, details: string | null = null) => ({
    code: "P0001",
    message,
    details: details as string,
  });

  it("maps each stable token to its code with a safe message", () => {
    for (const token of [
      "not_owner",
      "not_found",
      "listing_closed",
      "offer_not_pending",
      "own_listing",
      "team_unowned",
      "invalid_sports",
      "duplicate_offer",
      "same_participant",
      "stale_pick",
      "missing_scores",
    ]) {
      const mapped = toTradeError(raised(token));
      expect(mapped?.code).toBe(token);
      expect(mapped?.message).not.toContain("_");
    }
  });

  it("carries the blocking listing id for already_listed", () => {
    const id = "6f3b7c1e-8c1a-4a55-9d0a-1b2c3d4e5f60";
    expect(toTradeError(raised("already_listed", id))).toEqual({
      code: "already_listed",
      message: "One of those players is already up for trade.",
      listingId: id,
    });
  });

  it("drops a detail that is not a uuid instead of passing it upward", () => {
    const mapped = toTradeError(raised("already_listed", "select * from secrets"));
    expect(mapped).not.toHaveProperty("listingId");
  });

  it("does not claim errors it does not own", () => {
    expect(toTradeError({ code: "42501", message: "not_owner", details: "" })).toBeNull();
    expect(toTradeError(raised("something else"))).toBeNull();
    expect(toTradeError({ code: "23505", message: "duplicate key", details: "" })).toBeNull();
  });
});

describe("mutations", () => {
  const stub = (result: { data?: unknown; error?: unknown }) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
    return { rpc, repo: createTradesRepository({ rpc } as unknown as DbClient) };
  };
  const listed = tradeListedPost({ team: { name: "Coop", slug: "coop" }, items: [] });

  it("calls the function with the exact parameter names and returns the new id", async () => {
    const { rpc, repo } = stub({ data: "l-new" });
    const result = await repo.createListing({
      actorId: "u1",
      sports: ["nfl", "nba"],
      post: listed,
    });
    expect(result).toEqual({ ok: true, value: { listingId: "l-new" } });
    expect(rpc).toHaveBeenCalledWith("create_trade_listing", {
      p_actor: "u1",
      p_sport_codes: ["nfl", "nba"],
      p_post_body: listed.body,
      p_post_payload: listed.payload,
    });
  });

  it("returns a typed failure for a trade token", async () => {
    const { repo } = stub({ error: { code: "P0001", message: "listing_closed", details: "" } });
    const result = await repo.withdrawOffer({ actorId: "u1", offerId: "o1" });
    expect(result).toEqual({
      ok: false,
      error: { code: "listing_closed", message: "This listing is closed." },
    });
  });

  it("throws anything it cannot map, so an outage is never a user error", async () => {
    const boom = { code: "42501", message: "permission denied for function", details: "" };
    const { repo } = stub({ error: boom });
    await expect(repo.cancelListing({ actorId: "u1", listingId: "l1" })).rejects.toBe(boom);
  });

  it("sends live scores as snake_case rows and a null note as null", async () => {
    const { rpc, repo } = stub({});
    const post = tradeCompletedPost({
      owner: { name: "Coop", slug: "coop" },
      offerer: { name: "Papie", slug: "papie" },
      legs: [],
    });
    const result = await repo.acceptOffer({
      actorId: "u1",
      offerId: "o1",
      scores: [{ participantId: "p1", points: 6, championships: 1, postseasonPoints: 50 }],
      post,
    });
    expect(result).toEqual({ ok: true, value: null });
    expect(rpc).toHaveBeenCalledWith(
      "accept_trade_offer",
      expect.objectContaining({
        p_scores: [{ participant_id: "p1", points: 6, championships: 1, postseason_points: 50 }],
      }),
    );

    const direct = stub({ data: [{ listing_id: "l2", offer_id: "o2" }] });
    const proposed = await direct.repo.proposeDirect({
      actorId: "u1",
      targetTeamId: "t2",
      sports: ["nfl"],
      note: null,
      post: {
        body: "b",
        payload: {
          type: "trade_offer",
          offerKind: "direct",
          from: { name: "a", slug: "a" },
          to: { name: "b", slug: "b" },
          legs: [],
          note: null,
        },
      },
    });
    expect(proposed).toEqual({ ok: true, value: { listingId: "l2", offerId: "o2" } });
    expect(direct.rpc.mock.calls[0]?.[1]).toMatchObject({ p_target_team_id: "t2", p_note: null });
  });
});
