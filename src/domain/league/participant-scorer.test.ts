import { describe, expect, it } from "vitest";
import { buildLeagueModel } from "./build-league-model";
import { leagueData, wins } from "./fixtures";
import { createParticipantScorer } from "./participant-scorer";

describe("createParticipantScorer", () => {
  it("gives every pick exactly the score the league model shows for it", () => {
    const data = leagueData({
      teams: [{ id: "a" }, { id: "b", sharedPicks: { wnba: "shared-wnba" } }],
      results: [wins("a-nfl", 3), wins("b-nfl", 1), wins("shared-wnba", 4, "wnba")],
    });
    const score = createParticipantScorer(data);
    const model = buildLeagueModel(data, "2026-09-28");
    for (const team of model.standings)
      for (const pick of team.picks)
        expect(score(pick.sport, pick.participant.id)).toEqual(pick.score);
  });

  it("scores a participant nobody holds, and a participant with no results as zero", () => {
    const data = leagueData({
      teams: [{ id: "a" }],
      results: [wins("free-nfl", 2, "nfl")],
    });
    const score = createParticipantScorer(data);
    expect(score("nfl", "free-nfl").total).toBe(4);
    expect(score("nfl", "never-played").total).toBe(0);
  });

  it("keeps a separate cache entry per sport, so a wrong-sport call cannot poison a later one", () => {
    const data = leagueData({
      teams: [{ id: "a" }],
      results: [wins("shared-id", 3, "same")],
    });
    // One rule id that both sports know, worth a different amount in each, so the same result
    // scores differently depending on the sport it is scored under.
    for (const [sport, points] of [["nfl", 2] as const, ["wnba", 5] as const])
      data.rules.push({
        sport,
        code: "same-win",
        sortOrder: 99,
        rule: { kind: "per_win", id: "same-win", label: "Win", points, isChampionship: false },
      });
    const score = createParticipantScorer(data);

    expect(score("wnba", "shared-id").total).toBe(15);
    expect(score("nfl", "shared-id").total).toBe(6);
  });

  it("fails loudly for a sport with no season_sports row instead of scoring without its cap", () => {
    const data = leagueData({ teams: [{ id: "a" }] });
    data.sports = data.sports.filter((s) => s.code !== "pga");
    expect(() => createParticipantScorer(data)("pga", "x")).toThrow(/pga/);
  });
});
