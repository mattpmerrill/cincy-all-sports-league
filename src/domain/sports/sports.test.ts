import { describe, expect, it } from "vitest";
import { SPORTS, SPORT_CODES, SPORT_LIST, isSportCode } from "./sports";

describe("sport catalog", () => {
  it("has 11 unique sport codes", () => {
    expect(SPORT_CODES).toHaveLength(11);
    expect(new Set(SPORT_CODES).size).toBe(11);
  });

  it("keys every entry by its own code", () => {
    for (const code of SPORT_CODES) expect(SPORTS[code].code).toBe(code);
    expect(SPORT_LIST).toHaveLength(SPORT_CODES.length);
  });

  it("has a unique ESPN sport/league pair per sport, so adapters can't collide", () => {
    const pairs = SPORT_LIST.map((s) => `${s.espnSport}/${s.espnLeague}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("scores only tennis and golf by athlete", () => {
    const athletes = SPORT_LIST.filter((s) => s.participantKind === "athlete").map((s) => s.code);
    expect(athletes.sort()).toEqual(["pga", "wta"]);
  });

  it("gives athletes a ranking and teams a record style, never both", () => {
    for (const sport of SPORT_LIST) {
      const isAthlete = sport.participantKind === "athlete";
      expect(sport.recordStyle === "ranking").toBe(isAthlete);
      expect(sport.rankingLabel !== null).toBe(isAthlete);
    }
  });

  it("gives athletes a ranking and teams a record style, never both", () => {
    for (const sport of SPORT_LIST) {
      const isAthlete = sport.participantKind === "athlete";
      expect(sport.recordStyle === "ranking").toBe(isAthlete);
      expect(sport.rankingLabel !== null).toBe(isAthlete);
    }
  });

  it("narrows unknown strings", () => {
    expect(isSportCode("nfl")).toBe(true);
    expect(isSportCode("cricket")).toBe(false);
  });
});
