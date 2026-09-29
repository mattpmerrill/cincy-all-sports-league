import { describe, expect, it } from "vitest";
import post from "./__fixtures__/postseason-events.json";
import { appearancesFromEvents, fetchPostseasonStages } from "./postseason";
import { teamScoreboardSchema } from "./schemas";
import { withImpliedEarlierStages } from "./stages";
import { jsonResponse, noSleep, scriptedFetch } from "./test-utils";

const events = (sport: keyof typeof post) =>
  teamScoreboardSchema.parse({ events: post[sport] }).events;

const stagesOf = (sport: keyof typeof post, teamId: string, source = events(sport)) =>
  appearancesFromEvents(sport, source)
    .filter((a) => a.espnTeamId === teamId)
    .map((a) => a.stage);

describe("appearancesFromEvents", () => {
  it("NFL: byes leave no wild_card row, and the Pro Bowl is ignored", () => {
    // Seahawks (26) were the NFC #1 seed: they play divisional onward, never wild card.
    expect(stagesOf("nfl", "26")).toEqual(["divisional", "conference_championship", "champion"]);
    expect(stagesOf("nfl", "17")).toEqual([
      "wild_card",
      "divisional",
      "conference_championship",
      "runner_up",
    ]);
    // Teams 31/32 only played the Pro Bowl.
    expect(stagesOf("nfl", "31")).toEqual([]);
    expect(stagesOf("nfl", "32")).toEqual([]);
  });

  it("NHL: champion needs four wins in the Final; runner-up is the other finalist", () => {
    const all = appearancesFromEvents("nhl", events("nhl"));
    expect(all.filter((a) => a.stage === "champion")).toEqual([
      { espnTeamId: "7", stage: "champion" },
    ]);
    expect(all.filter((a) => a.stage === "runner_up")).toEqual([
      { espnTeamId: "37", stage: "runner_up" },
    ]);
  });

  it("NHL: a Final still in progress yields no champion or runner-up", () => {
    const finalGames = events("nhl").filter((e) =>
      e.competitions[0]?.notes?.[0]?.headline?.includes("Stanley Cup Final"),
    );
    const firstThree = finalGames.slice(0, 3); // 7 has one win, 37 has two
    const stages = appearancesFromEvents("nhl", firstThree).map((a) => a.stage);
    expect(stages).not.toContain("champion");
    expect(stages).not.toContain("runner_up");
  });

  it("does not double count a game returned by two overlapping queries", () => {
    const finalGames = events("nhl").filter((e) =>
      e.competitions[0]?.notes?.[0]?.headline?.includes("Stanley Cup Final"),
    );
    // Team 37 has two wins in games 1-3; counted twice it would fake a four-win clinch.
    const doubled = [...finalGames.slice(0, 3), ...finalGames.slice(0, 3)];
    const stages = appearancesFromEvents("nhl", doubled).map((a) => a.stage);
    expect(stages).not.toContain("champion");
  });

  it("MLB: maps ALWC/NLWC, ALDS/NLDS, ALCS/NLCS and the World Series", () => {
    const ladder = (id: string) => stagesOf("mlb", id);
    expect(ladder("19")).toContain("champion"); // Dodgers
    expect(ladder("14")).toContain("runner_up"); // Blue Jays
    expect(ladder("19")).toEqual(expect.arrayContaining(["division_series", "lcs"]));
  });

  it("MLS: rounds come from the season slug; Wild Card and Round One both mean first_round", () => {
    const stages = appearancesFromEvents("mls", events("mls"));
    expect(stages).toEqual(
      expect.arrayContaining([
        { espnTeamId: "20232", stage: "champion" },
        { espnTeamId: "9727", stage: "runner_up" },
        { espnTeamId: "9727", stage: "conference_final" },
      ]),
    );
    expect(stages.filter((a) => a.stage === "first_round").length).toBeGreaterThan(0);
  });

  it("WNBA: counts a best-of-5 Finals to three wins despite inconsistent 'FINALS' casing", () => {
    const stages = appearancesFromEvents("wnba", events("wnba"));
    expect(stages).toEqual(
      expect.arrayContaining([
        { espnTeamId: "17", stage: "champion" },
        { espnTeamId: "11", stage: "runner_up" },
      ]),
    );
  });

  it("CFP: uses playoff games only (a regular bowl is ignored) and finds all four quarterfinals", () => {
    const all = appearancesFromEvents("ncaaf", events("ncaaf"));
    expect(all.filter((a) => a.stage === "cfp_quarterfinal")).toHaveLength(8);
    expect(all.filter((a) => a.stage === "cfp_first_round")).toHaveLength(8);
    expect(all).toEqual(
      expect.arrayContaining([
        { espnTeamId: "84", stage: "champion" }, // Indiana
        { espnTeamId: "2390", stage: "runner_up" }, // Miami
      ]),
    );
    expect(stagesOf("ncaaf", "2032")).toEqual([]); // Xbox Bowl only
  });

  it("NCAA basketball: skips First Four, NIT and the Crown; 2nd Round is the round of 32", () => {
    for (const bowlTeam of ["152", "251", "167", "202", "277", "38"]) {
      expect(stagesOf("ncaab", bowlTeam)).toEqual([]);
    }
    expect(stagesOf("ncaab", "130")).toEqual(
      expect.arrayContaining(["round_of_32", "final_four", "champion"]),
    );
    expect(stagesOf("ncaab", "41")).toContain("runner_up");
  });

  it("softball: derives regional_final and WCWS semifinal from ESPN's 'advances to' headlines", () => {
    // Texas (538) won the WCWS over Texas Tech (613).
    expect(stagesOf("ncaasb", "538")).toEqual(
      expect.arrayContaining([
        "regional_final",
        "super_regional",
        "wcws_appearance",
        "wcws_semifinal",
        "champion",
      ]),
    );
    expect(stagesOf("ncaasb", "613")).toContain("runner_up");
    // Alabama (560) lost the bracket final: WCWS semifinalist, not a finalist.
    const alabama = stagesOf("ncaasb", "560");
    expect(alabama).toContain("wcws_semifinal");
    expect(alabama).not.toContain("runner_up");
  });

  it("a team in a regional's opening game alone has no stage (first-round exit scores 0)", () => {
    const ids = new Set(appearancesFromEvents("ncaasb", events("ncaasb")).map((a) => a.espnTeamId));
    const openingOnly = events("ncaasb")
      .filter((e) => e.competitions[0]?.notes?.[0]?.headline?.endsWith("Regional"))
      .flatMap((e) => e.competitions[0]?.competitors.map((c) => c.team.id) ?? [])
      .filter((id) => !ids.has(id));
    expect(openingOnly.length).toBeGreaterThan(0);
  });
});

describe("withImpliedEarlierStages (the bye decision, left to the sync layer)", () => {
  it("credits skipped rounds to a champion but never both final outcomes", () => {
    const strict = appearancesFromEvents("nfl", events("nfl"));
    const implied = withImpliedEarlierStages("nfl", strict);
    const seahawks = implied.filter((a) => a.espnTeamId === "26").map((a) => a.stage);
    expect(seahawks).toEqual(["wild_card", "divisional", "conference_championship", "champion"]);
    expect(seahawks).not.toContain("runner_up");
  });

  it("gives a runner-up every round below the final", () => {
    const implied = withImpliedEarlierStages("mlb", [{ espnTeamId: "1", stage: "runner_up" }]);
    expect(implied.map((a) => a.stage)).toEqual([
      "wild_card",
      "division_series",
      "lcs",
      "runner_up",
    ]);
  });

  it("leaves a team that lost its first game with just that round", () => {
    const implied = withImpliedEarlierStages("nba", [{ espnTeamId: "1", stage: "first_round" }]);
    expect(implied).toEqual([{ espnTeamId: "1", stage: "first_round" }]);
  });
});

describe("fetchPostseasonStages", () => {
  it("rejects sports without a team postseason instead of calling ESPN", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}));
    const result = await fetchPostseasonStages("wta", 2026, { fetchImpl });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_unsupported" } });
    expect(calls).toHaveLength(0);
  });

  it("asks ESPN for the CFP pseudo-week (month queries drop CFP games)", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({ events: post.ncaaf }));
    const result = await fetchPostseasonStages("ncaaf", 2025, { fetchImpl, sleep: noSleep });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("seasontype=3&week=999");
    expect(result.ok && result.value.some((a) => a.stage === "champion")).toBe(true);
  });
});
