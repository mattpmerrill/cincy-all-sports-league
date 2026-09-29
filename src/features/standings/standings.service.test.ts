import { describe, expect, it } from "vitest";
import { createLeagueModelSource } from "@/data/league-model";
import { SPORT_CODES } from "@/domain/sports/sports";
import { leagueData, wins } from "@/domain/league/fixtures";
import { createStandingsService } from "./standings.service";

const service = (data: ReturnType<typeof leagueData> | null) =>
  createStandingsService({
    model: createLeagueModelSource({
      loadData: async () => data,
      now: () => new Date("2026-09-28T16:00:00Z"),
    }),
  });

describe("getLeaderboard", () => {
  it("returns null before a season exists", async () => {
    expect(await service(null).getLeaderboard()).toBeNull();
  });

  it("counts sports by phase and zero-fills each row so contribution bars align", async () => {
    const board = await service(
      leagueData({
        teams: [{ id: "a" }, { id: "b" }],
        results: [wins("a-nfl", 3), wins("b-ncaaf", 1)],
        startsOn: { mlb: "2027-03-24", wnba: "2027-05-01" },
      }),
    ).getLeaderboard();

    expect(board?.progress).toMatchObject({ total: 11, inSeason: 9, complete: 0 });
    expect(board?.progress.phases[SPORT_CODES.indexOf("mlb")]).toBe("upcoming");
    expect(board?.maxSportPoints).toBe(6);
    const row = board?.rows[0];
    expect(row?.sportPoints).toHaveLength(11);
    expect(row?.sportPoints.find((s) => s.sport === "nfl")?.points).toBe(6);
    expect(row?.sportPoints.find((s) => s.sport === "mlb")?.points).toBe(0);
  });
});
