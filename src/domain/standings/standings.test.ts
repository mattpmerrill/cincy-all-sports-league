import { describe, expect, it } from "vitest";
import type { ParticipantScore } from "@/domain/scoring";
import { scoreParticipant } from "@/domain/scoring";
import type { ScoringRule } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";
import { creditedScore } from "./credited-score";
import { rankMovement, rankStandings } from "./rank-standings";
import { scoreFantasyTeam } from "./score-fantasy-team";
import type { TeamScore } from "./score-fantasy-team";

const score = (total: number, championships = 0, postseasonPoints = 0): ParticipantScore => ({
  total,
  championships,
  postseasonPoints,
  lines: [],
});
const team = (id: string, ...picks: [SportCode, ParticipantScore][]) =>
  scoreFantasyTeam({ id, name: id, picks: picks.map(([sport, s]) => ({ sport, score: s })) });

describe("scoreFantasyTeam", () => {
  it("sums picks and derives the tiebreaker inputs", () => {
    const t = team("a", ["nfl", score(9.3, 1, 50)], ["ncaaf", score(4.1)], ["mlb", score(0)]);
    expect(t.total).toBe(13.4);
    expect(t.championships).toBe(1);
    expect(t.postseasonPoints).toBe(50);
    expect(t.sportsWithPoints).toBe(2);
    expect(t.sportSubtotals).toContainEqual({ sport: "nfl", points: 9.3 });
  });
});

describe("creditedScore", () => {
  const totals = (total: number, championships = 0, postseasonPoints = 0) => ({
    total,
    championships,
    postseasonPoints,
  });
  const none = totals(0);

  it("equals the live score for a drafted pick", () => {
    expect(creditedScore(totals(9.3, 1, 50), none, [])).toEqual(totals(9.3, 1, 50));
  });

  it("drops what was earned before the pick arrived and adds what was banked", () => {
    const credited = creditedScore(totals(20, 1, 50), totals(8, 1, 30), [
      totals(6, 0, 5),
      totals(2.1, 1, 0),
    ]);
    expect(credited).toEqual(totals(20.1, 1, 25));
  });

  it("adds decimals exactly and lets a downward correction go negative instead of failing", () => {
    expect(creditedScore(totals(4.1), none, [totals(4.1), totals(4.1)]).total).toBe(12.3);
    expect(creditedScore(totals(0), none, [totals(-2)]).total).toBe(-2);
  });

  it("feeds team totals and every tiebreak input", () => {
    // Trading away the champion: the team keeps its 60 pts, championship and 50 postseason pts,
    // and the sport still counts as a sport with points.
    const kept = creditedScore(totals(0), totals(0), [totals(60, 1, 50)]);
    const t = team("a", ["nfl", { ...kept, lines: [] }], ["mlb", score(0)]);
    expect(t.total).toBe(60);
    expect(t.championships).toBe(1);
    expect(t.postseasonPoints).toBe(50);
    expect(t.sportsWithPoints).toBe(1);
    expect(t.sportSubtotals).toContainEqual({ sport: "nfl", points: 60 });
  });
});

describe("rankStandings", () => {
  const ranked = (teams: TeamScore[]) =>
    rankStandings(teams).map((t) => `${t.rankLabel}:${t.teamName}`);

  it("shares ranks on equal totals and skips the next rank", () => {
    const out = rankStandings([
      team("c", ["nfl", score(10)]),
      team("a", ["nfl", score(20)]),
      team("b", ["nfl", score(20)]),
    ]);
    expect(out.map((t) => [t.teamName, t.rank, t.isTied, t.rankLabel])).toEqual([
      ["a", 1, true, "T1"],
      ["b", 1, true, "T1"],
      ["c", 3, false, "3"],
    ]);
  });

  it("orders within a tie by championships, postseason, sports with points, then name", () => {
    const teams = [
      team("z-name", ["nfl", score(10)]),
      team("a-name", ["nfl", score(10)]),
      team("sports", ["nfl", score(5)], ["mlb", score(5)]),
      team("post", ["nfl", score(10, 0, 20)]),
      team("champ", ["nfl", score(10, 1, 0)]),
    ];
    expect(ranked(teams)).toEqual(["T1:champ", "T1:post", "T1:sports", "T1:a-name", "T1:z-name"]);
  });
});

describe("rankMovement", () => {
  it("reports direction and places", () => {
    expect(rankMovement(3, 5)).toEqual({ direction: "up", places: 2 });
    expect(rankMovement(5, 3)).toEqual({ direction: "down", places: 2 });
    expect(rankMovement(4, 4)).toEqual({ direction: "same", places: 0 });
    expect(rankMovement(4, null)).toEqual({ direction: "new", places: 0 });
  });
});

describe("spreadsheet parity, 2026-09-28 (only NCAAF 4.1/win and NFL 3/win score)", () => {
  const rules: Record<"ncaaf" | "nfl", ScoringRule[]> = {
    ncaaf: [{ kind: "per_win", id: "win", label: "Win", points: 4.1, isChampionship: false }],
    nfl: [{ kind: "per_win", id: "win", label: "Win", points: 3, isChampionship: false }],
  };
  const teamFromWins = (name: string, ncaafWins: number, nflWins: number) => {
    const pick = (sport: "ncaaf" | "nfl", wins: number) => ({
      sport,
      score: scoreParticipant(rules[sport], [{ ruleId: "win", quantity: wins }], {
        sport,
        playoffScoringMode: "cumulative",
        majorPointsCap: null,
      }),
    });
    return scoreFantasyTeam({
      id: name,
      name,
      picks: [pick("ncaaf", ncaafWins), pick("nfl", nflWins)],
    });
  };

  const table: [string, number, number, number][] = [
    ["Sher Bear", 4, 3, 25.4],
    ["Coop Doggies", 4, 3, 25.4],
    ["Papie", 4, 3, 25.4],
    ["Dirk's Sporting Goods", 4, 2, 22.4],
    ["Frosty X Salmon", 4, 2, 22.4],
    ["Minnesota's Golden 0-4's", 3, 3, 21.3],
    ["Double Play", 4, 1, 19.4],
    ["Big Ohio Guy", 4, 1, 19.4],
    ["Philly Flyers", 4, 1, 19.4],
    ["Big Booty Brooksie", 4, 1, 19.4],
    ["Sweet Rolls", 3, 2, 18.3],
    ["MumMums", 3, 2, 18.3],
    ["JV Jibby", 3, 2, 18.3],
    ["Dancing Ivory", 4, 0, 16.4],
    ["Bob Costas & The Sunshine State", 3, 1, 15.3],
    ["FoolioIglesias", 3, 1, 15.3],
    ["Deuces Wild", 3, 1, 15.3],
    ["Brady's Benchwarmers", 2, 2, 14.2],
    ["Team Love", 2, 2, 14.2],
    ["The Phippen Franchise", 3, 0, 12.3],
  ];

  const standings = rankStandings(table.map(([name, a, n]) => teamFromWins(name, a, n)));

  it("reproduces every total", () => {
    for (const [name, , , expected] of table) {
      expect(standings.find((t) => t.teamName === name)?.total).toBe(expected);
    }
  });

  it("puts the top three in a shared T1 and ranks the rest by competition rank", () => {
    expect(standings.slice(0, 3).map((t) => t.rankLabel)).toEqual(["T1", "T1", "T1"]);
    expect(
      standings
        .slice(0, 3)
        .map((t) => t.teamName)
        .sort(),
    ).toEqual(["Coop Doggies", "Papie", "Sher Bear"]);
    expect(standings[3]?.rankLabel).toBe("T4");
    expect(standings[5]?.rankLabel).toBe("6");
    expect(standings.at(-1)?.rankLabel).toBe("20");
  });
});
