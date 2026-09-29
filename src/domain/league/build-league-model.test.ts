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

  it("marks a sport complete when the champion is a participant nobody holds", () => {
    // A free agent can win the title. If only held champions counted, the sport would stay open
    // and someone could add the winner the day after.
    const model = buildLeagueModel(
      leagueData({
        teams: [{ id: "a" }],
        startsOn: { nfl: "2026-09-07" },
        results: [
          { participantId: "free-nfl", ruleId: "nfl-champion", quantity: 1, eventLabel: "" },
        ],
      }),
      TODAY,
    );
    expect(model.sports.nfl.status.phase).toBe("complete");
    // Nobody held the champion, so no team is credited with a championship.
    expect(model.standings[0]?.championships).toBe(0);
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

describe("credited scoring across trades (ADR-003)", () => {
  const totals = (model: ReturnType<typeof buildLeagueModel>) =>
    Object.fromEntries(model.standings.map((t) => [t.teamName, t.total]));
  const nflSubtotal = (model: ReturnType<typeof buildLeagueModel>, team: string) =>
    model.standings.find((t) => t.teamName === team)?.sportSubtotals.find((s) => s.sport === "nfl")
      ?.points;

  // a-nfl has 3 wins (6 pts), b-nfl has 1 win (2 pts) when a and b swap their NFL picks.
  const before = {
    teams: [{ id: "a" }, { id: "b" }],
    results: [wins("a-nfl", 3), wins("b-nfl", 1)],
  };
  const swapped = (extraResults: ReturnType<typeof wins>[] = []) => ({
    teams: [
      {
        id: "a",
        sharedPicks: { nfl: "b-nfl" },
        baselines: { nfl: { total: 2 } },
        banked: [{ sport: "nfl" as const, participantId: "a-nfl", total: 6 }],
      },
      {
        id: "b",
        sharedPicks: { nfl: "a-nfl" },
        baselines: { nfl: { total: 6 } },
        banked: [{ sport: "nfl" as const, participantId: "b-nfl", total: 2 }],
      },
    ],
    results: [...before.results, ...extraResults],
  });

  it("is identical to live scoring for a league that never traded", () => {
    const model = buildLeagueModel(leagueData(before), TODAY);
    for (const team of model.standings)
      for (const pick of team.picks) {
        expect(pick.credited).toEqual({
          total: pick.score.total,
          championships: pick.score.championships,
          postseasonPoints: pick.score.postseasonPoints,
        });
        expect(pick.adjustment.banked).toEqual([]);
      }
    expect(totals(model)).toEqual({ a: 6, b: 2 });
  });

  it("leaves every team's total unchanged at the moment of a trade", () => {
    const prior = buildLeagueModel(leagueData(before), TODAY);
    const after = buildLeagueModel(leagueData(swapped()), TODAY);
    expect(totals(after)).toEqual(totals(prior));
    expect(after.standings.map((t) => t.teamName)).toEqual(["a", "b"]);
  });

  it("sends points scored after the trade to the new holder only", () => {
    // b-nfl gains 2 wins (4 pts) and a-nfl gains 1 win (2 pts) after the swap.
    const model = buildLeagueModel(
      leagueData(swapped([wins("b-nfl", 2), wins("a-nfl", 1)])),
      TODAY,
    );
    expect(totals(model)).toEqual({ a: 10, b: 4 });
  });

  it("shows a traded-away player's points in the team's sport subtotal", () => {
    const model = buildLeagueModel(leagueData(swapped()), TODAY);
    expect(nflSubtotal(model, "a")).toBe(6);
    expect(nflSubtotal(model, "b")).toBe(2);
    const rows = model.sportPicks.nfl;
    // Ranked and labelled on credited points, while the participant's full score stays available.
    expect(rows.map((r) => [r.teamName, r.credited.total, r.score.total])).toEqual([
      ["a", 6, 2],
      ["b", 2, 6],
    ]);
  });

  it("counts a sport where a team's only points are banked toward sports with points", () => {
    const model = buildLeagueModel(
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
        results: before.results,
      }),
      TODAY,
    );
    const a = model.standings.find((t) => t.teamName === "a");
    expect(a?.picks.find((p) => p.sport === "nfl")?.score.total).toBe(2);
    expect(a?.sportsWithPoints).toBe(1);
  });

  it("follows a participant through a chained trade, crediting each holder for its own stretch", () => {
    // a trades a-nfl to b for b-nfl at 6 pts. a-nfl then earns 1 more win (8 pts). b trades a-nfl
    // to c for c-nfl (2 wins, 4 pts) at that moment.
    const model = buildLeagueModel(
      leagueData({
        teams: [
          {
            id: "a",
            sharedPicks: { nfl: "b-nfl" },
            baselines: { nfl: { total: 2 } },
            banked: [{ sport: "nfl", participantId: "a-nfl", total: 6 }],
          },
          {
            id: "b",
            sharedPicks: { nfl: "c-nfl" },
            baselines: { nfl: { total: 4 } },
            banked: [
              { sport: "nfl", participantId: "b-nfl", total: 2 },
              { sport: "nfl", participantId: "a-nfl", total: 2 },
            ],
          },
          {
            id: "c",
            sharedPicks: { nfl: "a-nfl" },
            baselines: { nfl: { total: 8 } },
            banked: [{ sport: "nfl", participantId: "c-nfl", total: 4 }],
          },
        ],
        // Live now: a-nfl 4 wins, b-nfl 1 win, c-nfl 2 wins, then a-nfl and c-nfl each win once more.
        results: [wins("a-nfl", 5), wins("b-nfl", 1), wins("c-nfl", 3)],
      }),
      TODAY,
    );
    // a: 6 banked + (b-nfl 2 - 2). b: 2 + 2 banked + (c-nfl 6 - 4). c: 4 banked + (a-nfl 10 - 8).
    expect(totals(model)).toEqual({ a: 6, b: 6, c: 6 });
    const b = model.standings.find((t) => t.teamName === "b");
    expect(b?.picks.find((p) => p.sport === "nfl")?.adjustment.banked).toHaveLength(2);
  });

  it("credits multi-sport trades per sport and leaves other sports alone", () => {
    const model = buildLeagueModel(
      leagueData({
        teams: [
          {
            id: "a",
            sharedPicks: { nfl: "b-nfl", nba: "b-nba" },
            baselines: { nfl: { total: 2 }, nba: { total: 4 } },
            banked: [
              { sport: "nfl", participantId: "a-nfl", total: 6 },
              { sport: "nba", participantId: "a-nba", total: 2 },
            ],
          },
          {
            id: "b",
            sharedPicks: { nfl: "a-nfl", nba: "a-nba" },
            baselines: { nfl: { total: 6 }, nba: { total: 2 } },
            banked: [
              { sport: "nfl", participantId: "b-nfl", total: 2 },
              { sport: "nba", participantId: "b-nba", total: 4 },
            ],
          },
        ],
        results: [
          wins("a-nfl", 3),
          wins("b-nfl", 1),
          wins("a-nba", 1),
          wins("b-nba", 2),
          wins("a-mlb", 5),
        ],
      }),
      TODAY,
    );
    // a: NFL 6 banked + NBA 2 banked + its untouched MLB pick (5 wins, 10). b: 2 + 4 banked.
    expect(totals(model)).toEqual({ a: 18, b: 6 });
  });

  it("credits championships and postseason points to the team that held the champion", () => {
    const champion = {
      participantId: "a-nfl",
      ruleId: "nfl-champion",
      quantity: 1,
      eventLabel: "",
    };
    // The champion is recorded before the trade: a banked it, so b gets no championship credit
    // even though it now holds the champion.
    const model = buildLeagueModel(
      leagueData({
        teams: [
          {
            id: "a",
            sharedPicks: { nfl: "b-nfl" },
            baselines: { nfl: { total: 0 } },
            banked: [
              {
                sport: "nfl",
                participantId: "a-nfl",
                total: 56,
                championships: 1,
                postseasonPoints: 50,
              },
            ],
          },
          {
            id: "b",
            sharedPicks: { nfl: "a-nfl" },
            baselines: { nfl: { total: 56, championships: 1, postseasonPoints: 50 } },
          },
        ],
        results: [wins("a-nfl", 3), champion],
      }),
      TODAY,
    );
    const [a, b] = ["a", "b"].map((name) => model.standings.find((t) => t.teamName === name));
    expect([a?.total, a?.championships, a?.postseasonPoints]).toEqual([56, 1, 50]);
    expect([b?.total, b?.championships, b?.postseasonPoints]).toEqual([0, 0, 0]);
    expect(model.standings[0]?.teamName).toBe("a");
  });

  it("handles the WNBA duplicate: a shared participant traded by one team still counts for the other", () => {
    // a and b share a WNBA participant. a trades it to c for c-wnba; b still holds it, untouched.
    const model = buildLeagueModel(
      leagueData({
        teams: [
          {
            id: "a",
            sharedPicks: { wnba: "c-wnba" },
            baselines: { wnba: { total: 2 } },
            banked: [{ sport: "wnba", participantId: "shared-wnba", total: 6 }],
          },
          { id: "b", sharedPicks: { wnba: "shared-wnba" } },
          {
            id: "c",
            sharedPicks: { wnba: "shared-wnba" },
            baselines: { wnba: { total: 6 } },
            banked: [{ sport: "wnba", participantId: "c-wnba", total: 2 }],
          },
        ],
        results: [wins("shared-wnba", 4, "wnba"), wins("c-wnba", 1)],
      }),
      TODAY,
    );
    const wnba = Object.fromEntries(
      model.sportPicks.wnba.map((r) => [r.teamName, r.credited.total]),
    );
    // Live: shared 8, c-wnba 2. a: 6 + (2 - 2); b: 8 (drafted); c: 2 + (8 - 6).
    expect(wnba).toEqual({ a: 6, b: 8, c: 4 });
    expect(model.sportPicks.wnba.map((r) => r.teamName)).toEqual(["b", "a", "c"]);
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
