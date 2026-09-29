import { describe, expect, it } from "vitest";
import { createLeagueModelSource } from "@/data/league-model";
import { leagueData } from "@/domain/league/fixtures";
import { TRADE_WINDOW_HOURS } from "@/domain/trades";
import { createRulesService } from "./rules.service";

const rules = (mode: "cumulative" | "highest_only", pgaCap: number | null) => {
  const data = leagueData({ teams: [{ id: "a" }] });
  data.season.playoffScoringMode = mode;
  const pga = data.sports.find((s) => s.code === "pga");
  if (pga) pga.majorPointsCap = pgaCap;
  const loadData = async () => data;
  return createRulesService({ model: createLeagueModelSource({ loadData }), loadData }).getRules();
};

describe("getRules", () => {
  it("words the playoff note from the season's scoring mode", async () => {
    expect((await rules("cumulative", null))?.notes.playoffs.title).toBe("Playoff points stack");
    expect((await rules("highest_only", null))?.notes.playoffs.title).toBe(
      "Best playoff round only",
    );
  });

  it("explains the major cap only for sports that have one", async () => {
    const view = await rules("cumulative", 50);
    expect(view?.sports.find((s) => s.code === "pga")?.majorCapNote).toBe(
      "Major points are capped at 50 per season.",
    );
    expect(view?.sports.find((s) => s.code === "nfl")?.majorCapNote).toBeNull();
    expect(view?.sports.find((s) => s.code === "nfl")?.groups.map((g) => g.kind)).toEqual([
      "regular_season",
      "playoffs",
    ]);
  });
});

describe("trade rules", () => {
  it("takes the offer window from the domain constant, so the copy cannot drift from the rule", async () => {
    const trades = (await rules("cumulative", null))?.notes.trades ?? [];
    const window = trades.find((n) => n.title.includes("to decide"));
    expect(window?.title).toContain(String(TRADE_WINDOW_HOURS));
    expect(window?.body).toContain(`${TRADE_WINDOW_HOURS} hours`);
  });
});

describe("free-agent rules", () => {
  it("explain the move rules on the rules page, in the league's vocabulary", async () => {
    const notes = (await rules("cumulative", null))?.notes.freeAgents ?? [];
    expect(notes.map((n) => n.title)).toEqual([
      "Drop and add in one step",
      "First come, first served",
      "Earned points stay put",
      "No moves after the season",
      "Moves cancel trade listings",
    ]);
    expect(JSON.stringify(notes)).not.toMatch(/waiver/i);
  });
});
