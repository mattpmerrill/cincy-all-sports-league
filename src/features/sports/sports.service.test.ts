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
      teamName: "a",
      participantName: "a-nfl",
      points: 4,
      traded: false,
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

describe("sports service after a trade", () => {
  it("ranks a sport by credited points, not by the participant's full score", async () => {
    // a traded a-nfl (6 pts at the time) for b-nfl (2 pts); a-nfl has since earned 2 more for b.
    const traded = createSportsService({
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
    const nfl = await traded.getSportView("nfl");
    expect(nfl?.picks.map((p) => [p.teamName, p.participant.name, p.points])).toEqual([
      ["a", "b-nfl", 6],
      ["b", "a-nfl", 2],
    ]);
    // The 6 is team a's: all of it banked from a-nfl. It must not read as b-nfl's score.
    expect(nfl?.leader).toEqual({
      teamName: "a",
      participantName: "b-nfl",
      points: 6,
      traded: true,
    });
    expect(nfl?.picks.map((p) => [p.teamName, p.traded])).toEqual([
      ["a", true],
      ["b", true],
    ]);
    expect((await traded.listSports()).find((s) => s.code === "nfl")?.leader).toMatchObject({
      teamName: "a",
      traded: true,
    });
  });
});
