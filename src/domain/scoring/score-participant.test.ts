import { describe, expect, it } from "vitest";
import { scoreParticipant } from "./score-participant";
import type { ParticipantResult, ScoringRule, SportScoringConfig } from "./types";

const rule = <K extends ScoringRule["kind"]>(
  kind: K,
  id: string,
  points: number,
  extra: Partial<ScoringRule> = {},
) => ({ kind, id, label: id, points, isChampionship: false, ...extra }) as ScoringRule;

const nflRules = [
  rule("per_win", "win", 3),
  rule("per_tie", "tie", 1.5),
  rule("playoff_milestone", "wild_card", 10),
  rule("playoff_milestone", "divisional", 20),
  rule("playoff_milestone", "conference", 30),
  rule("playoff_milestone", "runner_up", 40),
  rule("playoff_milestone", "champion", 50, { isChampionship: true }),
];
const nflConfig: SportScoringConfig = {
  sport: "nfl",
  playoffScoringMode: "cumulative",
  majorPointsCap: null,
};
const r = (ruleId: string, quantity = 1, eventLabel?: string): ParticipantResult => ({
  ruleId,
  quantity,
  eventLabel,
});

describe("per_win / per_tie", () => {
  it("multiplies and itemizes", () => {
    const score = scoreParticipant(nflRules, [r("win", 11), r("tie", 1)], nflConfig);
    expect(score.total).toBe(34.5);
    expect(score.lines[0]).toMatchObject({ kind: "per_win", quantity: 11, rate: 3, points: 33 });
    expect(score.lines[1]).toMatchObject({ kind: "per_tie", quantity: 1, points: 1.5 });
  });

  it("shows exact decimals", () => {
    const ncaaf = [rule("per_win", "win", 4.1)];
    const score = scoreParticipant(ncaaf, [r("win", 4)], { ...nflConfig, sport: "ncaaf" });
    expect(score.total).toBe(16.4);
    expect(score.lines[0]?.points).toBe(16.4);
  });

  it("scores nothing for no results", () => {
    expect(scoreParticipant(nflRules, [], nflConfig)).toMatchObject({ total: 0, lines: [] });
  });

  it("rejects a result for an unknown rule", () => {
    expect(() => scoreParticipant(nflRules, [r("nope")], nflConfig)).toThrow(/nope/);
  });
});

describe("playoff milestones", () => {
  const champion = [r("win", 12), r("wild_card"), r("divisional"), r("conference"), r("champion")];

  it("cumulative: NFL champion who played Wild Card = 10+20+30+50 plus wins", () => {
    const score = scoreParticipant(nflRules, champion, nflConfig);
    expect(score.total).toBe(36 + 110);
    expect(score.postseasonPoints).toBe(110);
    expect(score.championships).toBe(1);
  });

  it("highest_only counts only the best milestone", () => {
    const score = scoreParticipant(nflRules, champion, {
      ...nflConfig,
      playoffScoringMode: "highest_only",
    });
    expect(score.total).toBe(36 + 50);
    expect(score.postseasonPoints).toBe(50);
    expect(score.lines.filter((l) => l.kind === "playoff_milestone")).toHaveLength(1);
    expect(score.championships).toBe(1);
  });

  it("counts a duplicated milestone row once", () => {
    expect(scoreParticipant(nflRules, [r("wild_card"), r("wild_card")], nflConfig).total).toBe(10);
  });
});

describe("majors and rank bands (tennis)", () => {
  const slam = (id: string, points: number, isChampionship = false) =>
    rule("major_finish", id, points, { isChampionship });
  const band = (id: string, points: number, rankFrom: number, rankTo: number) =>
    ({ ...rule("final_rank_band", id, points), rankFrom, rankTo }) as ScoringRule;
  const tennis = [
    slam("slam_w", 12.5, true),
    slam("slam_f", 8),
    slam("slam_sf", 5),
    band("rank_1", 50, 1, 1),
    band("rank_5", 36, 5, 5),
    band("rank_6_10", 30, 6, 10),
    band("rank_51_100", 5, 51, 100),
  ];
  const config: SportScoringConfig = {
    sport: "wta",
    playoffScoringMode: "cumulative",
    majorPointsCap: 50,
  };

  it("sums per event, caps the total, and shows the cap as a line", () => {
    // 4 x 12.5 = 50 is exactly at the cap: no adjustment.
    const at = ["AO", "FO", "W", "USO"].map((e) => r("slam_w", 1, e));
    expect(scoreParticipant(tennis, at, config).lines.some((l) => l.kind === "major_cap")).toBe(
      false,
    );

    // 12.5 + 12.5 + 12.5 + 12.5 + extra would exceed; use 3 wins + 4 finals-ish over cap: 12.5*2 + 8*4 = 57.
    const over = [
      r("slam_w", 1, "AO"),
      r("slam_w", 1, "FO"),
      ...["W", "USO", "X", "Y"].map((e) => r("slam_f", 1, e)),
    ];
    const score = scoreParticipant(tennis, over, config);
    const cap = score.lines.find((l) => l.kind === "major_cap");
    expect(cap?.points).toBe(-7);
    expect(score.total).toBe(50);
    expect(score.postseasonPoints).toBe(50);
    expect(score.championships).toBe(2);
  });

  it("4 slam finishes over the cap plus year-end rank 7 (30)", () => {
    const results = [
      r("slam_w", 1, "AO"),
      r("slam_w", 1, "FO"),
      r("slam_w", 1, "W"),
      r("slam_w", 1, "USO"),
      r("slam_f", 1, "Extra"),
      r("rank_6_10", 7),
    ];
    // 62.5 -> capped 50, + 30
    const score = scoreParticipant(tennis, results, config);
    expect(score.total).toBe(80);
    expect(score.postseasonPoints).toBe(50);
  });

  it("finds the band containing the rank; edges and gaps", () => {
    const total = (rank: number) =>
      scoreParticipant(tennis, [r("rank_5", rank), r("rank_6_10", rank)], config).total;
    expect(total(5)).toBe(36);
    expect(total(6)).toBe(30);
    expect(total(10)).toBe(30);
    expect(total(11)).toBe(0); // no band -> 0
    const fifty = (rank: number) =>
      scoreParticipant(tennis, [r("rank_51_100", rank)], config).total;
    expect(fifty(100)).toBe(5);
    expect(fifty(101)).toBe(0);
  });
});

describe("golf FedExCup", () => {
  it("champion (#1) pays 50 and is not a postseason point", () => {
    const rules = [
      { ...rule("final_rank_band", "fedex_1", 50), rankFrom: 1, rankTo: 1 } as ScoringRule,
      { ...rule("final_rank_band", "fedex_2", 45), rankFrom: 2, rankTo: 2 } as ScoringRule,
    ];
    const score = scoreParticipant(rules, [r("fedex_1", 1)], {
      sport: "pga",
      playoffScoringMode: "cumulative",
      majorPointsCap: 50,
    });
    expect(score.total).toBe(50);
    expect(score.postseasonPoints).toBe(0);
  });
});
