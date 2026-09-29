import { describe, expect, it } from "vitest";
import { buildLeagueModel } from "@/domain/league";
import { leagueData } from "@/domain/league/fixtures";
import { freeAgentsIn, heldParticipantIds } from "./availability";

const pool = ["a-mlb", "b-mlb", "free-1", "free-2"].map((id) => ({ id }));

describe("freeAgentsIn", () => {
  it("leaves out everyone a team holds", () => {
    const free = freeAgentsIn({
      pool,
      heldIds: new Set(["a-mlb", "b-mlb"]),
      allowsDuplicatePicks: false,
      ownPickId: "a-mlb",
    });
    expect(free.map((p) => p.id)).toEqual(["free-1", "free-2"]);
  });

  it("in a sport that allows duplicates, hides only the team's own pick", () => {
    const free = freeAgentsIn({
      pool,
      heldIds: new Set(["a-mlb", "b-mlb"]),
      allowsDuplicatePicks: true,
      ownPickId: "a-mlb",
    });
    expect(free.map((p) => p.id)).toEqual(["b-mlb", "free-1", "free-2"]);
  });

  it("offers a visitor with no pick the whole duplicate-friendly pool", () => {
    const free = freeAgentsIn({
      pool,
      heldIds: new Set(["a-mlb"]),
      allowsDuplicatePicks: true,
      ownPickId: null,
    });
    expect(free).toHaveLength(4);
  });
});

describe("heldParticipantIds", () => {
  it("reads every team's pick in the sport, so a shared WNBA pick counts once", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [
          { id: "a", sharedPicks: { wnba: "shared" } },
          { id: "b", sharedPicks: { wnba: "shared" } },
          { id: "c" },
        ],
      }),
      "2026-09-28",
    );
    expect([...heldParticipantIds(model, "wnba")].sort()).toEqual(["c-wnba", "shared"]);
    expect([...heldParticipantIds(model, "mlb")].sort()).toEqual(["a-mlb", "b-mlb", "c-mlb"]);
  });
});
