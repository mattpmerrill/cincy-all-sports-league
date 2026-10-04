import { describe, expect, it } from "vitest";
import { parseLeaguePayload } from "./payload-schema";

describe("parseLeaguePayload", () => {
  it("round-trips a free-agent move payload", () => {
    const payload = {
      type: "free_agent_move",
      moveId: "m1",
      team: { name: "Coop Doggies", slug: "coop-doggies" },
      sport: "mlb",
      dropped: "Texas Rangers",
      added: "St. Louis Cardinals",
    };
    expect(parseLeaguePayload(payload)).toEqual(payload);
  });

  it("returns null for a free-agent move that lost a field or names an unknown sport", () => {
    const valid = {
      type: "free_agent_move",
      moveId: "m1",
      team: { name: "Coop Doggies", slug: "coop-doggies" },
      sport: "mlb",
      dropped: "Texas Rangers",
      added: "St. Louis Cardinals",
    };
    expect(parseLeaguePayload({ ...valid, added: undefined })).toBeNull();
    expect(parseLeaguePayload({ ...valid, sport: "curling" })).toBeNull();
  });

  it("returns null for a post type it does not know, so the card falls back to the body text", () => {
    expect(parseLeaguePayload({ type: "something_new", items: [] })).toBeNull();
    expect(parseLeaguePayload(null)).toBeNull();
  });
});

describe("parseLeaguePayload, matchups_week", () => {
  const valid = {
    type: "matchups_week",
    weekStart: "2026-10-12",
    results: [
      {
        home: { name: "Sher Bear", slug: "sher-bear" },
        away: { name: "Papie", slug: "papie" },
        homeGain: 12.4,
        awayGain: 8,
        outcome: "home",
      },
    ],
    pairings: [
      {
        home: { name: "Sher Bear", slug: "sher-bear" },
        away: { name: "Coop Doggies", slug: "coop-doggies" },
      },
    ],
  };

  it("round-trips a post with results and pairings, and one with either list empty", () => {
    expect(parseLeaguePayload(valid)).toEqual(valid);
    expect(parseLeaguePayload({ ...valid, results: [] })).toEqual({ ...valid, results: [] });
    expect(parseLeaguePayload({ ...valid, pairings: [] })).toEqual({ ...valid, pairings: [] });
  });

  it("returns null for an unknown outcome or a result that lost a field", () => {
    const [first] = valid.results;
    expect(parseLeaguePayload({ ...valid, results: [{ ...first, outcome: "draw" }] })).toBeNull();
    expect(
      parseLeaguePayload({ ...valid, results: [{ ...first, awayGain: undefined }] }),
    ).toBeNull();
    expect(parseLeaguePayload({ ...valid, weekStart: undefined })).toBeNull();
  });
});
