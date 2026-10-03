import { describe, expect, it } from "vitest";
import { SPORT_CODES } from "@/domain/sports/sports";
import { formatRanking, formatRecord, recordLine } from "./record";

const record = (wins: number, losses: number, ties = 0, otLosses = 0) => ({
  wins,
  losses,
  ties,
  otLosses,
});

describe("formatRecord", () => {
  it("writes W-L for the plain sports and ignores stray tie or OTL counts", () => {
    for (const sport of ["mlb", "nba", "wnba", "ncaaf", "ncaab", "ncaasb"] as const) {
      expect(formatRecord(sport, record(10, 4, 2, 3))).toBe("10-4");
    }
  });

  it("shows NFL ties only when there are some", () => {
    expect(formatRecord("nfl", record(10, 6))).toBe("10-6");
    expect(formatRecord("nfl", record(4, 12, 1))).toBe("4-12-1");
  });

  it("always shows the NHL overtime-loss column, even at zero", () => {
    expect(formatRecord("nhl", record(30, 20, 0, 5))).toBe("30-20-5");
    expect(formatRecord("nhl", record(30, 20, 0, 0))).toBe("30-20-0");
  });

  it("writes MLS draws as the third number, always", () => {
    expect(formatRecord("mls", record(12, 8, 6))).toBe("12-8-6");
    expect(formatRecord("mls", record(12, 8, 0))).toBe("12-8-0");
  });

  it("has no record for athlete sports", () => {
    expect(formatRecord("wta", record(1, 1))).toBeNull();
    expect(formatRecord("pga", record(1, 1))).toBeNull();
  });
});

describe("formatRanking", () => {
  it("names the ranking each athlete sport uses", () => {
    expect(formatRanking("wta", 4)).toBe("No. 4 WTA");
    expect(formatRanking("pga", 12)).toBe("No. 12 FedExCup");
  });

  it("has no ranking for team sports", () => {
    expect(formatRanking("nfl", 1)).toBeNull();
  });
});

describe("recordLine", () => {
  it("labels a team's record for assistive technology", () => {
    expect(recordLine("nhl", { record: record(30, 20, 0, 5), rank: null })).toEqual({
      kind: "record",
      text: "30-20-5",
      label: "Regular-season record",
    });
  });

  it("shows an athlete's rank from the rank-band result, not a record", () => {
    expect(recordLine("wta", { record: null, rank: 4 })).toEqual({
      kind: "ranking",
      text: "No. 4 WTA",
      label: "Ranking",
    });
    // A team-shaped record on an athlete is ignored: the catalog decides what a sport shows.
    expect(recordLine("pga", { record: record(3, 1), rank: 12 })?.text).toBe("No. 12 FedExCup");
  });

  it("shows nothing before there is something to say", () => {
    // Season not started: no row at all, or the vendor's all-zero standings table.
    expect(recordLine("nfl", { record: null, rank: null })).toBeNull();
    expect(recordLine("nfl", { record: record(0, 0), rank: null })).toBeNull();
    // An unranked or out-of-band athlete has no rank-band result.
    expect(recordLine("wta", { record: null, rank: null })).toBeNull();
  });

  it("does not treat a team's rank as a record, nor an athlete's record as a rank", () => {
    expect(recordLine("mlb", { record: null, rank: 3 })).toBeNull();
    expect(recordLine("wta", { record: record(5, 1), rank: null })).toBeNull();
  });

  it("shows a real 0-win record once a game has been played", () => {
    expect(recordLine("mlb", { record: record(0, 1), rank: null })?.text).toBe("0-1");
    expect(recordLine("nhl", { record: record(0, 0, 0, 1), rank: null })?.text).toBe("0-0-1");
  });

  it("covers every sport in the catalog", () => {
    for (const sport of SPORT_CODES) {
      const line = recordLine(sport, { record: record(1, 1), rank: 1 });
      expect(line, sport).not.toBeNull();
    }
  });
});
