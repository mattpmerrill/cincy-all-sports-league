import { describe, expect, it } from "vitest";
import type { LeagueData } from "@/domain/league";
import { computeSnapshotRows } from "./snapshot";

const participant = (id: string) => ({
  id,
  name: id,
  shortName: id,
  logoUrl: null,
  primaryColor: null,
});

const data: LeagueData = {
  season: {
    id: "s",
    name: "s",
    startsOn: "2026-08-27",
    endsOn: "2027-11-15",
    playoffScoringMode: "cumulative",
  },
  sports: [
    { code: "nfl", startsOn: "2026-09-07", majorPointsCap: null, allowsDuplicatePicks: false },
  ],
  rules: [
    {
      sport: "nfl",
      code: "win",
      sortOrder: 1,
      rule: { id: "win", label: "Win", points: 4.1, isChampionship: false, kind: "per_win" },
    },
  ],
  teams: [
    {
      id: "b",
      slug: "b",
      name: "Bravo",
      owner: null,
      picks: [{ sport: "nfl", participant: participant("p2") }],
    },
    {
      id: "a",
      slug: "a",
      name: "Alpha",
      owner: null,
      picks: [{ sport: "nfl", participant: participant("p1") }],
    },
    {
      id: "c",
      slug: "c",
      name: "Charlie",
      owner: null,
      picks: [{ sport: "nfl", participant: participant("p3") }],
    },
  ],
  results: [
    { participantId: "p1", ruleId: "win", quantity: 4, eventLabel: "" },
    { participantId: "p2", ruleId: "win", quantity: 4, eventLabel: "" },
  ],
  snapshots: [],
  lastSyncAt: null,
};

describe("computeSnapshotRows", () => {
  it("scores through the domain: exact totals, shared ranks, competition numbering", () => {
    const rows = computeSnapshotRows(data);
    const by = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    expect(by.a).toEqual({ teamId: "a", rank: 1, totalPoints: 16.4 });
    expect(by.b).toEqual({ teamId: "b", rank: 1, totalPoints: 16.4 });
    expect(by.c).toEqual({ teamId: "c", rank: 3, totalPoints: 0 });
  });
});
