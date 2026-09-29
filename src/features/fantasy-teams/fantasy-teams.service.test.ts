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

  it("marks a pick movable until its season is over", async () => {
    const team = await service().getTeamDetail("a");
    expect(team?.picks.every((p) => p.movable)).toBe(true);

    const over = await createFantasyTeamsService({
      model: createLeagueModelSource({
        loadData: async () =>
          leagueData({
            teams: [{ id: "a" }],
            // A recorded champion ends the sport's season.
            results: [
              { participantId: "a-nfl", ruleId: "nfl-champion", quantity: 1, eventLabel: "Final" },
            ],
          }),
        now: () => new Date("2026-09-28T16:00:00Z"),
      }),
    }).getTeamDetail("a");
    expect(over?.picks.find((p) => p.sport === "nfl")?.movable).toBe(false);
    expect(over?.picks.find((p) => p.sport === "mlb")?.movable).toBe(true);
  });
});

describe("getTeamDetail after a trade", () => {
  // a and b swapped NFL picks: a-nfl had 3 wins (6) and b-nfl 1 win (2) when they did.
  const traded = createFantasyTeamsService({
    model: createLeagueModelSource({
      loadData: async () =>
        leagueData({
          teams: [
            {
              id: "a",
              sharedPicks: { nfl: "b-nfl" },
              baselines: { nfl: { total: 2 } },
              banked: [{ sport: "nfl", participantId: "a-nfl", total: 6 }],
            },
            { id: "b", sharedPicks: { nfl: "a-nfl" }, baselines: { nfl: { total: 6 } } },
          ],
          results: [wins("a-nfl", 4), wins("b-nfl", 1)],
        }),
      now: () => new Date("2026-09-28T16:00:00Z"),
    }),
  });

  it("shows credited points and explains the adjustment in the breakdown", async () => {
    const team = await traded.getTeamDetail("a");
    const nfl = team?.picks.find((p) => p.sport === "nfl");
    // Holds b-nfl (2 pts live, 2 already earned before arriving) plus the 6 it banked from a-nfl.
    expect(nfl?.points).toBe(6);
    expect(nfl?.lines.map((l) => l.text)).toEqual([
      "1 win × 2",
      "Earned 2 pts before joining this team (not counted)",
      "Includes 6 pts from a-nfl before the trade",
    ]);
    expect(nfl?.lines.reduce((sum, l) => sum + l.points, 0)).toBe(nfl?.points);
    expect(team?.total).toBe(6);
  });
});
