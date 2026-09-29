import { describe, expect, it } from "vitest";
import { createLeagueModelSource } from "@/data/league-model";
import { leagueData, wins } from "@/domain/league/fixtures";
import { createSportsService } from "./sports.service";

const service = () =>
  createSportsService({
    model: createLeagueModelSource({
      loadData: async () =>
        leagueData({
          teams: [
            { id: "a", sharedPicks: { wnba: "shared" } },
            { id: "b", sharedPicks: { wnba: "shared" } },
            { id: "c" },
          ],
          results: [wins("a-nfl", 2), wins("shared", 5, "wnba")],
        }),
      now: () => new Date("2026-09-28T16:00:00Z"),
    }),
  });

describe("sports service", () => {
  it("lists every sport with a leader only where someone has scored", async () => {
    const sports = await service().listSports();
    expect(sports).toHaveLength(11);
    expect(sports.find((s) => s.code === "nfl")?.leader).toEqual({
      participantName: "a-nfl",
      points: 4,
    });
    expect(sports.find((s) => s.code === "mlb")?.leader).toBeNull();
  });

  it("shows a shared WNBA pick once per team, tied and ahead of the rest", async () => {
    const view = await service().getSportView("wnba");
    expect(view?.picks.map((p) => [p.teamName, p.participant.name, p.rankLabel])).toEqual([
      ["a", "shared", "T1"],
      ["b", "shared", "T1"],
      ["c", "c-wnba", "3"],
    ]);
  });
});
