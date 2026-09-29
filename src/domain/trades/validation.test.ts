import { describe, expect, it } from "vitest";
import type { SportCode } from "@/domain/sports/sports";
import { AN_HOUR_AGO, NOW, item, listing, offer, phases, teamRef } from "./fixtures";
import type { TradeCheck, TradeItem } from "./types";
import {
  tradeableSports,
  validateDirectRequest,
  validateListingRequest,
  validateOfferRequest,
} from "./validation";

const picks = (...items: TradeItem[]) => items;
const mine = {
  id: "papie",
  picks: picks(item("nfl", "Kansas City Chiefs"), item("nba", "Lakers")),
};
const theirs = {
  ...teamRef("Coop Doggies"),
  picks: picks(item("nfl", "Chicago Bears"), item("nba", "Boston Celtics")),
};

const code = (check: TradeCheck) => (check.ok ? "ok" : check.error.code);

describe("tradeableSports", () => {
  it("keeps held sports whose season is not complete, in catalog order", () => {
    const held = picks(item("nfl", "a"), item("nba", "b"), item("mlb", "c"));
    expect(tradeableSports(held, phases(["nba"]))).toEqual(["mlb", "nfl"]);
    expect(tradeableSports([], phases())).toEqual([]);
  });
});

describe("validateListingRequest", () => {
  const base = { team: mine, sportStatuses: phases(), listings: [], now: NOW };
  const run = (
    sports: SportCode[],
    over: Partial<Parameters<typeof validateListingRequest>[0]> = {},
  ) => code(validateListingRequest({ ...base, sports, ...over }));

  it("accepts sports the team holds", () => {
    expect(run(["nfl", "nba"])).toBe("ok");
  });

  it("rejects an empty list, repeats and sports without a pick", () => {
    expect(run([])).toBe("invalid_sports");
    expect(run(["nfl", "nfl"])).toBe("invalid_sports");
    expect(run(["mlb"])).toBe("invalid_sports");
  });

  it("locks a sport whose season is complete", () => {
    expect(run(["nfl"], { sportStatuses: phases(["nfl"]) })).toBe("sport_locked");
  });

  it("points at the live listing that already offers the player, and ignores expired ones", () => {
    const own = {
      ownerTeam: { ...teamRef("Papie"), id: "papie" },
      items: [item("nfl", "Kansas City Chiefs")],
    };
    const blocked = validateListingRequest({
      ...base,
      sports: ["nfl"],
      listings: [listing({ id: "live", ...own })],
    });
    expect(blocked).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "already_listed", listingId: "live" }),
    });
    expect(run(["nfl"], { listings: [listing({ ...own, closesAt: AN_HOUR_AGO })] })).toBe("ok");
    expect(run(["nba"], { listings: [listing(own)] })).toBe("ok");
  });
});

describe("validateDirectRequest", () => {
  const base = { team: mine, target: theirs, sportStatuses: phases(), listings: [], now: NOW };
  const run = (
    sports: SportCode[],
    over: Partial<Parameters<typeof validateDirectRequest>[0]> = {},
  ) => code(validateDirectRequest({ ...base, sports, ...over }));

  it("accepts a trade with another owned team", () => {
    expect(run(["nfl"])).toBe("ok");
  });

  it("refuses your own team and a team nobody owns", () => {
    expect(run(["nfl"], { target: { ...mine, owner: null } })).toBe("own_listing");
    expect(run(["nfl"], { target: { ...theirs, owner: null } })).toBe("team_unowned");
  });

  it("needs a non-empty, unique list where both teams hold a pick", () => {
    expect(run([])).toBe("invalid_sports");
    expect(run(["nfl", "nfl"])).toBe("invalid_sports");
    expect(run(["mlb"])).toBe("invalid_sports");
    expect(
      run(["nfl"], { target: { ...theirs, picks: picks(item("nba", "Boston Celtics")) } }),
    ).toBe("invalid_sports");
  });

  it("locks completed sports", () => {
    expect(run(["nba"], { sportStatuses: phases(["nba"]) })).toBe("sport_locked");
  });

  it("refuses swapping a WNBA participant both teams hold", () => {
    const wnba = picks(item("wnba", "Las Vegas Aces"));
    expect(
      run(["wnba"], { team: { ...mine, picks: wnba }, target: { ...theirs, picks: wnba } }),
    ).toBe("same_participant");
  });

  it("reports the target's live listing that already offers the player", () => {
    const check = validateDirectRequest({
      ...base,
      sports: ["nfl"],
      listings: [listing({ id: "live" })],
    });
    expect(check).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "already_listed", listingId: "live" }),
    });
  });
});

describe("validateOfferRequest", () => {
  const base = { listing: listing(), team: mine, sportStatuses: phases(), now: NOW };
  const run = (
    sports: SportCode[],
    over: Partial<Parameters<typeof validateOfferRequest>[0]> = {},
  ) => code(validateOfferRequest({ ...base, sports, ...over }));

  it("accepts any non-empty subset of the listing's sports", () => {
    expect(run(["nfl"])).toBe("ok");
    expect(run(["nba", "nfl"])).toBe("ok");
  });

  it("refuses your own listing and a listing that is closed or expired", () => {
    expect(run(["nfl"], { team: { ...mine, id: "coop-doggies" } })).toBe("own_listing");
    expect(run(["nfl"], { listing: listing({ status: "cancelled" }) })).toBe("listing_closed");
    expect(run(["nfl"], { listing: listing({ closesAt: AN_HOUR_AGO }) })).toBe("listing_closed");
  });

  it("refuses empty, repeated and off-listing sports", () => {
    expect(run([])).toBe("invalid_sports");
    expect(run(["nfl", "nfl"])).toBe("invalid_sports");
    expect(run(["mlb"])).toBe("invalid_sports");
  });

  it("allows one pending offer per team but not after it was withdrawn", () => {
    const pending = offer({ offeringTeam: teamRef("Papie"), status: "pending" });
    const withdrawn = offer({ offeringTeam: teamRef("Papie"), status: "withdrawn" });
    expect(run(["nfl"], { listing: listing({ offers: [pending] }) })).toBe("duplicate_offer");
    expect(run(["nfl"], { listing: listing({ offers: [withdrawn] }) })).toBe("ok");
  });

  it("locks completed sports and refuses trading a participant for itself", () => {
    expect(run(["nfl"], { sportStatuses: phases(["nfl"]) })).toBe("sport_locked");
    const same = picks(item("nfl", "Chicago Bears"));
    expect(run(["nfl"], { team: { ...mine, picks: same } })).toBe("same_participant");
  });
});
