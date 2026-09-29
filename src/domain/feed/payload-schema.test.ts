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
