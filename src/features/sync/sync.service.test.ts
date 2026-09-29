import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/domain/league";
import type { ParticipantResultRow, ResultUpsert } from "@/data/participant-results.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import type { SyncRunRow } from "@/data/sync-runs.repository";
import { err, ok } from "@/lib/result";
import { createLogger } from "@/lib/logger";
import type { ResultsProvider, SportFacts } from "./results-provider";
import { createSyncService, type SyncDeps } from "./sync.service";

const NOW = new Date("2026-09-28T16:00:00Z"); // 12:00 in Cincinnati, still 2026-09-28

const target = (sport: SportTarget["sport"], over: Partial<SportTarget> = {}): SportTarget => ({
  seasonId: "season",
  seasonEndsOn: "2027-11-15",
  sportId: `id-${sport}`,
  sport,
  startsOn: "2026-09-07",
  espnSeason: 2026,
  rules: [
    {
      id: "win",
      code: "win",
      label: "Win",
      kind: "per_win",
      points: 4,
      rankFrom: null,
      rankTo: null,
      sortOrder: 1,
    },
    {
      id: "champ",
      code: "champion",
      label: "Champion",
      kind: "playoff_milestone",
      points: 10,
      rankFrom: null,
      rankTo: null,
      sortOrder: 2,
    },
  ],
  participants: [{ id: `${sport}-p1`, name: "Team", shortName: "T", externalId: "1" }],
  ...over,
});

const league: LeagueData = {
  season: {
    id: "season",
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
      rule: { id: "win", label: "Win", points: 4, isChampionship: false, kind: "per_win" },
    },
  ],
  teams: [
    {
      id: "t1",
      slug: "a",
      name: "A",
      owner: null,
      picks: [
        {
          sport: "nfl",
          participant: {
            id: "nfl-p1",
            name: "Team",
            shortName: "T",
            logoUrl: null,
            primaryColor: null,
          },
        },
      ],
    },
    {
      id: "t2",
      slug: "b",
      name: "B",
      owner: null,
      picks: [
        {
          sport: "nfl",
          participant: {
            id: "other",
            name: "O",
            shortName: "O",
            logoUrl: null,
            primaryColor: null,
          },
        },
      ],
    },
  ],
  results: [{ participantId: "nfl-p1", ruleId: "win", quantity: 3, eventLabel: "" }],
  snapshots: [],
  lastSyncAt: null,
};

function harness(opts: {
  targets: SportTarget[];
  facts?: (sport: string) => ReturnType<ResultsProvider["fetchFacts"]>;
  latest?: Map<string, SyncRunRow>;
  applyChanges?: SyncDeps["results"]["applyChanges"];
  existing?: ParticipantResultRow[];
}) {
  const runs = {
    started: [] as string[],
    finished: [] as { id: string; status: string; summary: unknown }[],
    skipped: [] as string[],
  };
  const snapshotWrites: unknown[] = [];
  const invalidate = vi.fn();
  const applied: { upserts: readonly ResultUpsert[] }[] = [];
  const facts =
    opts.facts ??
    (() => Promise.resolve(ok<SportFacts>({ records: [{ externalId: "1", wins: 3, ties: 0 }] })));

  const deps: SyncDeps = {
    provider: { fetchFacts: ({ sport }) => facts(sport) },
    targets: {
      listSportTargets: async (only) => opts.targets.filter((t) => !only || only.includes(t.sport)),
    },
    results: {
      listForParticipants: async () => opts.existing ?? [],
      applyChanges:
        opts.applyChanges ??
        (async (_season, upserts, deleteIds) => {
          applied.push({ upserts });
          return { upserted: upserts.length, deleted: deleteIds.length };
        }),
    },
    runs: {
      start: async (sportId) => {
        runs.started.push(sportId);
        return `run-${sportId}`;
      },
      finish: async (id, status, summary) => {
        runs.finished.push({ id, status, summary });
      },
      recordSkipped: async (sportId) => {
        runs.skipped.push(sportId);
      },
      failStale: async () => 0,
      latestForSports: async () => opts.latest ?? new Map(),
    },
    snapshots: { upsertDay: async (...args) => void snapshotWrites.push(args) },
    league: { load: async () => league },
    invalidate,
    logger: createLogger({ test: true }),
    newCorrelationId: () => "corr-1",
  };
  return { service: createSyncService(deps), runs, snapshotWrites, invalidate, applied };
}

describe("syncLeague", () => {
  it("writes facts, records a succeeded run, snapshots standings and invalidates the cache", async () => {
    const h = harness({ targets: [target("nfl")] });
    const report = await h.service.syncLeague({ now: NOW });

    expect(report).toMatchObject({ correlationId: "corr-1", changed: true, snapshot: "written" });
    expect(report.sports).toEqual([{ sport: "nfl", status: "succeeded", upserted: 1, deleted: 0 }]);
    expect(h.runs.finished[0]).toMatchObject({
      status: "succeeded",
      summary: { upserted: 1, correlationId: "corr-1", unmatchedExternalIds: [] },
    });
    // Team A owns the 3-win participant (12 points), team B has nothing.
    expect(h.snapshotWrites).toEqual([
      [
        "season",
        "2026-09-28",
        [
          { teamId: "t1", rank: 1, totalPoints: 12 },
          { teamId: "t2", rank: 2, totalPoints: 0 },
        ],
      ],
    ]);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it("neither snapshots nor invalidates when nothing changed", async () => {
    const h = harness({
      targets: [target("nfl")],
      applyChanges: async () => ({ upserted: 0, deleted: 0 }),
    });
    const report = await h.service.syncLeague({ now: NOW });
    expect(report).toMatchObject({ changed: false, snapshot: "not_needed" });
    expect(h.snapshotWrites).toEqual([]);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("isolates a failing sport: it records a failed run and the others still sync", async () => {
    const h = harness({
      targets: [target("nfl"), target("nba"), target("mlb")],
      facts: (sport) =>
        sport === "nba"
          ? Promise.resolve(err("espn_timeout", "ESPN request failed (espn_timeout)"))
          : Promise.resolve(ok<SportFacts>({ records: [{ externalId: "1", wins: 2, ties: 0 }] })),
    });
    const report = await h.service.syncLeague({ now: NOW });

    expect(report.sports.map((s) => [s.sport, s.status])).toEqual([
      ["nfl", "succeeded"],
      ["nba", "failed"],
      ["mlb", "succeeded"],
    ]);
    expect(h.runs.finished.find((r) => r.id === "run-id-nba")).toMatchObject({
      status: "failed",
      summary: { error: { code: "espn_timeout" } },
    });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it("turns a thrown error into a failed run with a fixed message, not the raw error", async () => {
    const h = harness({
      targets: [target("nfl"), target("nba")],
      facts: (sport) => {
        if (sport === "nfl") throw new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2");
        return Promise.resolve(ok<SportFacts>({ records: [] }));
      },
    });
    const report = await h.service.syncLeague({ now: NOW });

    expect(report.sports[0]).toMatchObject({ sport: "nfl", status: "failed", code: "unexpected" });
    expect(report.sports[1]?.status).toBe("succeeded");
    const summary = JSON.stringify(h.runs.finished.find((r) => r.id === "run-id-nfl"));
    expect(summary).not.toContain("hunter2");
    expect(summary).toContain("corr-1");
  });

  it("fails a sport whose fact has no scoring rule, and writes nothing for it", async () => {
    const h = harness({
      targets: [target("nfl")],
      facts: () =>
        Promise.resolve(ok<SportFacts>({ stages: [{ externalId: "1", stage: "mystery_round" }] })),
    });
    const report = await h.service.syncLeague({ now: NOW });
    expect(report.sports[0]).toMatchObject({ status: "failed", code: "missing_rule" });
    expect(h.applied).toEqual([]);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("skips a sport outside its season window and notes it once per day", async () => {
    const targets = [
      target("nhl", { startsOn: "2026-09-29" }),
      target("nba", { seasonEndsOn: "2026-09-27" }),
    ];
    const first = harness({ targets });
    const report = await first.service.syncLeague({ now: NOW });
    expect(report.sports.map((s) => [s.status, s.code])).toEqual([
      ["skipped", "before_season_start"],
      ["skipped", "after_season_end"],
    ]);
    expect(first.runs.started).toEqual([]);
    expect(first.runs.skipped).toEqual(["id-nhl", "id-nba"]);

    const noted: SyncRunRow = {
      id: "x",
      sportId: "id-nhl",
      startedAt: "2026-09-28T03:00:00Z", // 23:00 the night before in Cincinnati: not today
      finishedAt: "2026-09-28T03:00:00Z",
      status: "skipped",
      summary: {},
    };
    const today: SyncRunRow = { ...noted, sportId: "id-nba", startedAt: "2026-09-28T12:00:00Z" };
    const second = harness({
      targets,
      latest: new Map([
        ["id-nhl", noted],
        ["id-nba", today],
      ]),
    });
    await second.service.syncLeague({ now: NOW });
    expect(second.runs.skipped).toEqual(["id-nhl"]);
  });

  it("syncs only the requested sports", async () => {
    const h = harness({ targets: [target("nfl"), target("nba")] });
    const report = await h.service.syncLeague({ now: NOW, sports: ["nba"] });
    expect(report.sports.map((s) => s.sport)).toEqual(["nba"]);
  });

  it("passes only picked participants' vendor ids to the provider", async () => {
    const seen: unknown[] = [];
    const h = harness({
      targets: [
        target("ncaaf", {
          participants: [
            { id: "a", name: "A", shortName: "A", externalId: "61" },
            { id: "b", name: "B", shortName: "B", externalId: null },
          ],
        }),
      ],
      facts: (sport) => {
        seen.push(sport);
        return Promise.resolve(ok<SportFacts>({ records: [] }));
      },
    });
    await h.service.syncLeague({ now: NOW });
    expect(seen).toEqual(["ncaaf"]);
  });
});
