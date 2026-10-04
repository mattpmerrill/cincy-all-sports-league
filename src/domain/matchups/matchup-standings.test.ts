import { describe, expect, it } from "vitest";
import { matchup } from "./fixtures";
import { buildMatchupStandings, type MatchupStandingTeam } from "./matchup-standings";

const team = (
  teamId: string,
  rank: number,
  teamName = teamId.toUpperCase(),
): MatchupStandingTeam => ({
  teamId,
  teamName,
  rank,
});

const W1 = "2026-10-05";
const W2 = "2026-10-12";
const W3 = "2026-10-19";

/** A final matchup where `home` gained `h` and `away` gained `a` from zero. */
const final = (week: string, home: string, away: string, h: number, a: number) =>
  matchup(week, home, away, { end: [h, a] });

const order = (rows: { teamId: string }[]) => rows.map((r) => r.teamId);

describe("buildMatchupStandings, records", () => {
  it("counts wins, losses and ties from final matchups and sums the weekly gains", () => {
    const rows = buildMatchupStandings(
      [team("a", 1), team("b", 2), team("c", 3), team("d", 4)],
      [final(W1, "a", "b", 5, 2), final(W1, "c", "d", 1, 1), final(W2, "a", "c", 3, 7)],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    expect(byId.a).toMatchObject({ wins: 1, losses: 1, ties: 0, pointsGained: 8 });
    expect(byId.b).toMatchObject({ wins: 0, losses: 1, ties: 0, pointsGained: 2 });
    expect(byId.c).toMatchObject({ wins: 1, losses: 0, ties: 1, pointsGained: 8 });
    expect(byId.d).toMatchObject({ wins: 0, losses: 0, ties: 1, pointsGained: 1 });
  });

  it("leaves live matchups out of the record and the points", () => {
    const rows = buildMatchupStandings(
      [team("a", 1), team("b", 2)],
      [final(W1, "a", "b", 5, 2), matchup(W2, "b", "a", { start: [2, 5], end: null })],
    );
    expect(rows.find((r) => r.teamId === "b")).toMatchObject({
      wins: 0,
      losses: 1,
      pointsGained: 2,
    });
  });

  it("shows teams with no matchups yet as 0-0-0 with no streak", () => {
    const rows = buildMatchupStandings([team("a", 1), team("b", 2)], []);
    expect(rows).toEqual([
      expect.objectContaining({ wins: 0, losses: 0, ties: 0, pointsGained: 0, streak: null }),
      expect.objectContaining({ wins: 0, losses: 0, ties: 0, pointsGained: 0, streak: null }),
    ]);
  });

  it("sums gains without float drift and keeps negative weeks negative", () => {
    const rows = buildMatchupStandings(
      [team("a", 1), team("b", 2)],
      [final(W1, "a", "b", 0.1, 0), final(W2, "a", "b", 0.2, 0), final(W3, "b", "a", 0, -1.5)],
    );
    expect(rows.find((r) => r.teamId === "a")?.pointsGained).toBe(-1.2);
    expect(rows.find((r) => r.teamId === "a")).toMatchObject({ wins: 2, losses: 1 });
  });

  it("ignores matchup sides for teams it was not given", () => {
    const rows = buildMatchupStandings([team("a", 1)], [final(W1, "a", "ghost", 5, 2)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wins: 1 });
  });
});

describe("buildMatchupStandings, streaks", () => {
  const one = (matchups: ReturnType<typeof matchup>[]) =>
    buildMatchupStandings([team("a", 1), team("b", 2)], matchups).find((r) => r.teamId === "a")
      ?.streak;

  it("counts consecutive identical results back from the most recent final week", () => {
    expect(
      one([final(W1, "a", "b", 1, 5), final(W2, "a", "b", 5, 1), final(W3, "a", "b", 5, 1)]),
    ).toEqual({ result: "win", length: 2, label: "W2" });
  });

  it("is L1 after a single loss that ended a winning run", () => {
    expect(
      one([final(W1, "a", "b", 5, 1), final(W2, "a", "b", 5, 1), final(W3, "a", "b", 1, 5)]),
    ).toMatchObject({ label: "L1" });
  });

  it("counts ties as a streak of their own", () => {
    expect(
      one([final(W1, "a", "b", 5, 1), final(W2, "a", "b", 2, 2), final(W3, "a", "b", 0, 0)]),
    ).toEqual({ result: "tie", length: 2, label: "T2" });
  });

  it("does not depend on the order the matchups arrive in", () => {
    const week = [final(W3, "a", "b", 1, 5), final(W1, "a", "b", 5, 1), final(W2, "a", "b", 5, 1)];
    expect(one(week)?.label).toBe("L1");
    expect(one([...week].reverse())?.label).toBe("L1");
  });

  it("reads the whole history when every result is the same", () => {
    expect(one([final(W1, "a", "b", 5, 1), final(W2, "b", "a", 1, 5)])?.label).toBe("W2");
  });

  it("ignores a live matchup, and is null when only live ones exist", () => {
    expect(one([matchup(W1, "a", "b")])).toBeNull();
    expect(one([final(W1, "a", "b", 5, 1), matchup(W2, "a", "b")])?.label).toBe("W1");
  });
});

describe("buildMatchupStandings, order and shared ranks", () => {
  it("orders by more wins, then fewer losses, then more points gained, then season rank, then name", () => {
    const teams = [
      team("a", 5),
      team("b", 4),
      team("c", 3),
      team("d", 2),
      team("e", 1),
      team("f", 6, "Zed"),
      team("g", 6, "Alf"),
      team("h", 7),
    ];
    const rows = buildMatchupStandings(teams, [
      // Records: a 2-0, c 1-0, d 1-1, b 0-1, e 0-2, and f, g, h have not played.
      final(W1, "a", "b", 10, 1),
      final(W1, "c", "e", 3, 1),
      final(W2, "d", "e", 4, 1),
      final(W3, "d", "a", 1, 9),
    ]);
    // Wins first (a, c, d), then fewer losses among the winless: the unplayed 0-0 teams (season
    // rank, then name: f and g share season rank 6, so Alf before Zed), then b 0-1, then e 0-2.
    expect(order(rows)).toEqual(["a", "c", "d", "g", "f", "h", "b", "e"]);
  });

  it("breaks a record tie on points gained, then season rank, then team name", () => {
    const rows = buildMatchupStandings(
      [team("a", 4), team("b", 3), team("c", 2), team("d", 1)],
      [final(W1, "a", "b", 9, 1), final(W1, "c", "d", 5, 1)],
    );
    // Both winners are 1-0: a gained 9, c gained 5. Both losers are 0-1: d gained 1, b gained 1.
    expect(order(rows)).toEqual(["a", "c", "d", "b"]);
    // d and b are level on record and points, so season rank (d is 1, b is 3) orders them.
    expect(rows.find((r) => r.teamId === "d")).toMatchObject({ isTied: true, rank: 3 });
    expect(rows.find((r) => r.teamId === "b")).toMatchObject({ isTied: true, rank: 3 });
  });

  it("orders teams level on everything, season rank included, by name", () => {
    const rows = buildMatchupStandings([team("x", 1, "Zed"), team("y", 1, "alf")], []);
    expect(order(rows)).toEqual(["y", "x"]);
  });

  it("shares a rank only when wins, losses and points match, and skips the next rank", () => {
    const rows = buildMatchupStandings(
      [team("a", 1), team("b", 2), team("c", 3), team("d", 4)],
      [final(W1, "a", "b", 5, 1), final(W1, "c", "d", 5, 1)],
    );
    // a and c are both 1-0 with +5: they share rank 1; b and d share rank 3.
    expect(rows.map((r) => r.rankLabel)).toEqual(["T1", "T1", "T3", "T3"]);
    expect(order(rows)).toEqual(["a", "c", "b", "d"]);
  });

  it("gives a clear leader a plain rank label", () => {
    const rows = buildMatchupStandings([team("a", 1), team("b", 2)], [final(W1, "a", "b", 5, 1)]);
    expect(rows.map((r) => r.rankLabel)).toEqual(["1", "2"]);
    expect(rows.map((r) => r.isTied)).toEqual([false, false]);
  });

  it("does not let the season rank split a shared position", () => {
    const rows = buildMatchupStandings([team("a", 9), team("b", 1)], [final(W1, "a", "b", 5, 5)]);
    expect(rows.map((r) => r.rankLabel)).toEqual(["T1", "T1"]);
    expect(order(rows)).toEqual(["b", "a"]);
  });
});

describe("buildMatchupStandings, current opponent", () => {
  const teams = [team("a", 1), team("b", 2), team("c", 3)];
  const matchups = [
    final(W1, "a", "b", 5, 1),
    matchup(W2, "a", "c"),
    // c's own week-2 row is the same matchup; b has a bye in week 2.
  ];

  it("names each side's opponent in the live matchup of the given week", () => {
    const rows = buildMatchupStandings(teams, matchups, { currentWeekStart: W2 });
    const opponent = (id: string) => rows.find((r) => r.teamId === id)?.currentOpponentId;
    expect(opponent("a")).toBe("c");
    expect(opponent("c")).toBe("a");
    expect(opponent("b")).toBeNull();
  });

  it("is null for everyone when no week is supplied or the week is not live", () => {
    for (const options of [{}, { currentWeekStart: null }, { currentWeekStart: W1 }]) {
      const rows = buildMatchupStandings(teams, matchups, options);
      expect(rows.every((r) => r.currentOpponentId === null)).toBe(true);
    }
  });
});
