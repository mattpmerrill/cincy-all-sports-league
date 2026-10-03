import { describe, expect, it } from "vitest";
import type { LeagueData } from "@/domain/league";
import { computeScoreChanges, planChanges } from "./score-changes";

const data: LeagueData = {
  season: {
    id: "s",
    name: "s",
    startsOn: "2026-08-27",
    endsOn: "2027-11-15",
    playoffScoringMode: "highest_only",
  },
  sports: [
    {
      code: "nfl",
      startsOn: "2026-09-07",
      endsOn: null,
      majorPointsCap: null,
      allowsDuplicatePicks: false,
    },
  ],
  rules: [
    {
      sport: "nfl",
      code: "win",
      sortOrder: 1,
      rule: { id: "win", label: "Win", points: 3, isChampionship: false, kind: "per_win" },
    },
    {
      sport: "nfl",
      code: "wc",
      sortOrder: 2,
      rule: {
        id: "wc",
        label: "Wild card",
        points: 5,
        isChampionship: false,
        kind: "playoff_milestone",
      },
    },
    {
      sport: "nfl",
      code: "sb",
      sortOrder: 3,
      rule: {
        id: "sb",
        label: "Champion",
        points: 20,
        isChampionship: true,
        kind: "playoff_milestone",
      },
    },
  ],
  teams: ["a", "b"].map((id) => ({
    id,
    slug: id,
    name: id.toUpperCase(),
    owner: null,
    picks: [
      {
        sport: "nfl" as const,
        participant: {
          id: "niners",
          name: "49ers",
          shortName: "SF",
          logoUrl: null,
          primaryColor: null,
        },
        baseline: { total: 0, championships: 0, postseasonPoints: 0 },
        acquiredAt: null,
      },
    ],
    banked: [],
  })),
  results: [],
  records: [],
  snapshots: [],
  lastSyncAt: null,
};

const existing = (id: string, ruleId: string, quantity: number, eventLabel = "") => ({
  id,
  participantId: "niners",
  ruleId,
  quantity,
  eventLabel,
  isLocked: false,
});

describe("planChanges", () => {
  it("applies upserts on the natural key and deletes by id", () => {
    const [change] = planChanges(
      "nfl",
      [existing("r1", "win", 2), existing("r2", "wc", 1)],
      [{ participantId: "niners", ruleId: "win", quantity: 3, eventLabel: "" }],
      ["r2"],
    );
    expect(change?.before).toHaveLength(2);
    expect(change?.after).toEqual([{ ruleId: "win", quantity: 3, eventLabel: "" }]);
  });
});

describe("computeScoreChanges", () => {
  it("gives every team that picked the participant the same delta from the real scoring rules", () => {
    const changes = planChanges(
      "nfl",
      [existing("r1", "win", 2)],
      [{ participantId: "niners", ruleId: "win", quantity: 3, eventLabel: "" }],
      [],
    );
    const items = computeScoreChanges(data, changes);
    expect(items.map((i) => [i.teamName, i.pointsDelta])).toEqual([
      ["A", 3],
      ["B", 3],
    ]);
  });

  it("reports only the difference the scoring mode makes: highest_only ignores a lower milestone", () => {
    const changes = planChanges(
      "nfl",
      [existing("r1", "sb", 1)],
      [{ participantId: "niners", ruleId: "wc", quantity: 1, eventLabel: "" }],
      [],
    );
    expect(computeScoreChanges(data, changes)).toEqual([]);
  });

  it("reports a negative delta when a result is deleted", () => {
    const changes = planChanges("nfl", [existing("r1", "win", 2)], [], ["r1"]);
    expect(computeScoreChanges(data, changes)[0]?.pointsDelta).toBe(-6);
  });

  it("ignores participants no team picked", () => {
    const changes = planChanges(
      "nfl",
      [],
      [{ participantId: "nobody", ruleId: "win", quantity: 1, eventLabel: "" }],
      [],
    );
    expect(computeScoreChanges(data, changes)).toEqual([]);
  });
});
