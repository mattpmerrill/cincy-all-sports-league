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

const NO_BASELINE = { total: 0, championships: 0, postseasonPoints: 0 };

const data: LeagueData = {
  season: {
    id: "s",
    name: "s",
    startsOn: "2026-08-27",
    endsOn: "2027-11-15",
    playoffScoringMode: "cumulative",
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
      rule: { id: "win", label: "Win", points: 4.1, isChampionship: false, kind: "per_win" },
    },
  ],
  teams: [
    {
      id: "b",
      slug: "b",
      name: "Bravo",
      owner: null,
      picks: [
        { sport: "nfl", participant: participant("p2"), baseline: NO_BASELINE, acquiredAt: null },
      ],
      banked: [],
    },
    {
      id: "a",
      slug: "a",
      name: "Alpha",
      owner: null,
      picks: [
        { sport: "nfl", participant: participant("p1"), baseline: NO_BASELINE, acquiredAt: null },
      ],
      banked: [],
    },
    {
      id: "c",
      slug: "c",
      name: "Charlie",
      owner: null,
      picks: [
        { sport: "nfl", participant: participant("p3"), baseline: NO_BASELINE, acquiredAt: null },
      ],
      banked: [],
    },
  ],
  results: [
    { participantId: "p1", ruleId: "win", quantity: 4, eventLabel: "" },
    { participantId: "p2", ruleId: "win", quantity: 4, eventLabel: "" },
  ],
  records: [],
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

  it("does not move anyone when a trade happens with no new results (credited, not live, points)", () => {
    // Alpha and Bravo swap their NFL picks. Live scores follow the participants, but each team's
    // credited total must stay put: before the swap Alpha had p1 (16.4) and Bravo had p2 (4.1).
    const traded: LeagueData = {
      ...data,
      results: [
        { participantId: "p1", ruleId: "win", quantity: 4, eventLabel: "" },
        { participantId: "p2", ruleId: "win", quantity: 1, eventLabel: "" },
      ],
    };
    const before = computeSnapshotRows(traded);
    const swapped: LeagueData = {
      ...traded,
      teams: traded.teams.map((t) => {
        const other = t.id === "a" ? "p2" : t.id === "b" ? "p1" : null;
        if (!other) return t;
        const mine = t.picks[0]?.participant.id;
        const liveOf = (id: string | undefined) => (id === "p1" ? 16.4 : id === "p2" ? 4.1 : 0);
        return {
          ...t,
          picks: [
            {
              sport: "nfl" as const,
              participant: participant(other),
              baseline: { ...NO_BASELINE, total: liveOf(other) },
              acquiredAt: "2026-09-20T12:00:00Z",
            },
          ],
          banked: [
            {
              sport: "nfl" as const,
              participant: participant(mine ?? ""),
              source: "trade" as const,
              ...NO_BASELINE,
              total: liveOf(mine),
            },
          ],
        };
      }),
    };
    expect(computeSnapshotRows(swapped)).toEqual(before);
  });
});
