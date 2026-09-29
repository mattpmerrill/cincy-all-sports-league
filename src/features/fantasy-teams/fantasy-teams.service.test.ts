import { describe, expect, it } from "vitest";
import { createLeagueModelSource } from "@/data/league-model";
import { leagueData, wins } from "@/domain/league/fixtures";
import { createFantasyTeamsService } from "./fantasy-teams.service";

const service = () =>
  createFantasyTeamsService({
    model: createLeagueModelSource({
      loadData: async () =>
        leagueData({
          teams: [{ id: "a" }, { id: "b" }],
          results: [wins("a-nfl", 3), wins("a-ncaaf", 4), wins("b-nfl", 1)],
          startsOn: { nba: "2026-10-20" },
        }),
      now: () => new Date("2026-09-28T16:00:00Z"),
    }),
  });

describe("getTeamDetail", () => {
  it("returns null for an unknown slug", async () => {
    expect(await service().getTeamDetail("nobody")).toBeNull();
  });

  it("lists all 11 picks, earners first, each with status and readable breakdown", async () => {
    const team = await service().getTeamDetail("a");
    expect(team?.picks).toHaveLength(11);
    expect(team?.picks.slice(0, 2).map((p) => [p.sport, p.points])).toEqual([
      ["ncaaf", 8],
      ["nfl", 6],
    ]);
    expect(team?.picks[0]?.lines[0]?.text).toBe("4 wins × 2");
    const nba = team?.picks.find((p) => p.sport === "nba");
    expect(nba?.status.label).toBe("Starts Oct 20");
    expect(nba?.lines).toEqual([]);
    expect(team?.rankLabel).toBe("1");
    expect(team?.teamCount).toBe(2);
  });
});
