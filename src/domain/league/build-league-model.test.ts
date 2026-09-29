import { describe, expect, it } from "vitest";
import { buildLeagueModel, previousRanks } from "./build-league-model";
import { leagueData, wins } from "./fixtures";

const TODAY = "2026-09-28";

describe("buildLeagueModel", () => {
  it("scores picks from facts and ranks the standings with shared T ranks", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [{ id: "a" }, { id: "b" }, { id: "c" }],
        results: [wins("a-nfl", 3), wins("b-nfl", 3), wins("c-nfl", 1)],
      }),
      TODAY,
    );
    expect(model.standings.map((t) => [t.teamName, t.total, t.rankLabel])).toEqual([
      ["a", 6, "T1"],
      ["b", 6, "T1"],
      ["c", 2, "3"],
    ]);
  });

  it("marks a sport complete only once a champion is recorded, never from the calendar", () => {
    const base = { teams: [{ id: "a" }], startsOn: { mlb: "2027-03-24", nfl: "2026-09-07" } };
    const before = buildLeagueModel(leagueData(base), TODAY);
    expect(before.sports.mlb.status).toEqual({ phase: "upcoming", label: "Starts Mar 24" });
    expect(before.sports.nfl.status).toEqual({ phase: "in_season", label: "In season" });

    const after = buildLeagueModel(
      leagueData({
        ...base,
        results: [{ participantId: "a-nfl", ruleId: "nfl-champion", quantity: 1, eventLabel: "" }],
      }),
      TODAY,
    );
    expect(after.sports.nfl.status.phase).toBe("complete");
    expect(after.sports.mlb.status.phase).toBe("upcoming");
    // Championship points flow into the tiebreak inputs too.
    expect(after.standings[0]?.championships).toBe(1);
  });

  it("ranks a sport with one row per team, so a shared WNBA pick shows up for both owners", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [
          { id: "a", sharedPicks: { wnba: "shared-wnba" } },
          { id: "b", sharedPicks: { wnba: "shared-wnba" } },
          { id: "c" },
        ],
        results: [wins("shared-wnba", 5, "wnba"), wins("c-wnba", 2)],
      }),
      TODAY,
    );
    const rows = model.sportPicks.wnba;
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.teamName, r.participant.name, r.score.total, r.rankLabel])).toEqual([
      ["a", "shared-wnba", 10, "T1"],
      ["b", "shared-wnba", 10, "T1"],
      ["c", "c-wnba", 4, "3"],
    ]);
  });

  it("does not double count a shared participant in team totals", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [
          { id: "a", sharedPicks: { wnba: "shared-wnba" } },
          { id: "b", sharedPicks: { wnba: "shared-wnba" } },
        ],
        results: [wins("shared-wnba", 5, "wnba")],
      }),
      TODAY,
    );
    expect(model.standings.map((t) => t.total)).toEqual([10, 10]);
  });

  it("fails loudly when a sport has no season_sports row", () => {
    const data = leagueData({ teams: [{ id: "a" }] });
    data.sports = data.sports.filter((s) => s.code !== "pga");
    expect(() => buildLeagueModel(data, TODAY)).toThrow(/pga/);
  });
});

describe("movement from snapshots", () => {
  const snap = (teamId: string, date: string, rank: number) => ({
    teamId,
    date,
    rank,
    totalPoints: 0,
  });

  it("compares against the latest day before today, ignoring today's own snapshot", () => {
    const previous = previousRanks(
      [snap("a", "2026-09-27", 2), snap("a", "2026-09-26", 1), snap("a", TODAY, 1)],
      TODAY,
    );
    expect(previous.get("a")).toBe(2);
  });

  it("gives 'new' when there is no earlier snapshot and directions otherwise", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [{ id: "a" }, { id: "b" }, { id: "c" }],
        results: [wins("a-nfl", 3), wins("b-nfl", 2), wins("c-nfl", 1)],
        snapshots: [snap("a", "2026-09-27", 2), snap("b", "2026-09-27", 1)],
      }),
      TODAY,
    );
    const movement = Object.fromEntries(model.standings.map((t) => [t.teamName, t.movement]));
    expect(movement.a).toEqual({ direction: "up", places: 1 });
    expect(movement.b).toEqual({ direction: "down", places: 1 });
    expect(movement.c).toEqual({ direction: "new", places: 0 });
  });
});
