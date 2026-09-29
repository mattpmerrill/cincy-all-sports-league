import { describe, expect, it, vi } from "vitest";
import type { LeaguePost } from "@/domain/feed";
import type { LeagueData } from "@/domain/league";
import type { ParticipantResultRow, ResultUpsert } from "@/data/participant-results.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import type { SyncRunRow } from "@/data/sync-runs.repository";
import type { NewParticipant, StoredParticipant } from "@/data/participants.repository";
import { err, ok } from "@/lib/result";
import { createLogger } from "@/lib/logger";
import type {
  DirectoryProvider,
  FactsRequest,
  ResultsProvider,
  SportFacts,
} from "./results-provider";
import { createSyncService, type SyncDeps } from "./sync.service";

const NOW = new Date("2026-09-28T16:00:00Z"); // 12:00 in Cincinnati, still 2026-09-28

const target = (sport: SportTarget["sport"], over: Partial<SportTarget> = {}): SportTarget => ({
  seasonId: "season",
  endsOn: "2027-11-15",
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
  freeAgents: [],
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
          baseline: { total: 0, championships: 0, postseasonPoints: 0 },
          acquiredAt: null,
        },
      ],
      banked: [],
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
          baseline: { total: 0, championships: 0, postseasonPoints: 0 },
          acquiredAt: null,
        },
      ],
      banked: [],
    },
  ],
  results: [{ participantId: "nfl-p1", ruleId: "win", quantity: 3, eventLabel: "" }],
  snapshots: [],
  lastSyncAt: null,
};

/** College feeds cost one ESPN call per team, so they are fetched per participant. */
const PER_TEAM_FEEDS: readonly string[] = ["ncaaf", "ncaab", "ncaasb"];

function harness(opts: {
  targets: SportTarget[];
  facts?: (sport: string, request: FactsRequest) => ReturnType<ResultsProvider["fetchFacts"]>;
  directory?: DirectoryProvider["fetchDirectory"];
  stored?: StoredParticipant[];
  latest?: Map<string, SyncRunRow>;
  applyChanges?: SyncDeps["results"]["applyChanges"];
  existing?: ParticipantResultRow[];
  previousRanks?: { teamId: string; rank: number }[];
  moversAlreadyPosted?: boolean;
  leagueData?: LeagueData;
  failPosts?: boolean;
}) {
  const leaguePosts: LeaguePost[] = [];
  const runs = {
    started: [] as string[],
    finished: [] as { id: string; status: string; summary: unknown }[],
    skipped: [] as string[],
  };
  const snapshotWrites: unknown[] = [];
  const invalidate = vi.fn();
  const applied: { upserts: readonly ResultUpsert[] }[] = [];
  const factsRequests: FactsRequest[] = [];
  const insertedRows: NewParticipant[][] = [];
  const facts =
    opts.facts ??
    (() => Promise.resolve(ok<SportFacts>({ records: [{ externalId: "1", wins: 3, ties: 0 }] })));

  const deps: SyncDeps = {
    provider: {
      fetchFacts: (request) => {
        factsRequests.push(request);
        return facts(request.sport, request);
      },
      fetchesPerParticipant: (sport) => PER_TEAM_FEEDS.includes(sport),
    },
    directory: {
      fetchDirectory: opts.directory ?? (async () => ok({ entries: [], skipped: [] })),
    },
    participants: {
      listForSport: async () => opts.stored ?? [],
      insertMany: async (rows) => {
        insertedRows.push([...rows]);
        return rows.length;
      },
    },
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
    snapshots: {
      upsertDay: async (...args) => void snapshotWrites.push(args),
      latestBefore: async () => opts.previousRanks ?? [],
    },
    posts: {
      write: async (_season, post) => {
        if (opts.failPosts) throw new Error("db down");
        leaguePosts.push(post);
      },
      hasMoversPost: async () => opts.moversAlreadyPosted ?? false,
    },
    league: { load: async () => opts.leagueData ?? league },
    invalidate,
    logger: createLogger({ test: true }),
    newCorrelationId: () => "corr-1",
  };
  return {
    service: createSyncService(deps),
    runs,
    snapshotWrites,
    invalidate,
    applied,
    leaguePosts,
    factsRequests,
    insertedRows,
  };
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

  it("syncs a sport on its own last day, and skips it the day after", async () => {
    const lastDay = harness({ targets: [target("nba", { endsOn: "2026-09-28" })] });
    expect((await lastDay.service.syncLeague({ now: NOW })).sports[0]?.status).not.toBe("skipped");
    const dayAfter = harness({ targets: [target("nba", { endsOn: "2026-09-27" })] });
    expect((await dayAfter.service.syncLeague({ now: NOW })).sports[0]).toMatchObject({
      status: "skipped",
      code: "after_season_end",
    });
  });

  it("skips a sport outside its season window and notes it once per day", async () => {
    const targets = [
      target("nhl", { startsOn: "2026-09-29" }),
      target("nba", { endsOn: "2026-09-27" }),
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

describe("league posts", () => {
  const winsRow: ParticipantResultRow = {
    id: "r1",
    participantId: "nfl-p1",
    ruleId: "win",
    quantity: 3,
    eventLabel: "",
    source: "espn",
    isLocked: false,
    updatedAt: "2026-09-28T00:00:00Z",
  };

  it("writes one batched score update naming the team that gained the points", async () => {
    const h = harness({ targets: [target("nfl")] });
    await h.service.syncLeague({ now: NOW });
    expect(h.leaguePosts).toHaveLength(1);
    expect(h.leaguePosts[0]).toMatchObject({
      body: "Scores update: Team +12 (A)",
      payload: { type: "score_update", items: [{ teamSlug: "a", sport: "nfl", pointsDelta: 12 }] },
    });
  });

  it("writes nothing on a second identical sync", async () => {
    const h = harness({ targets: [target("nfl")], existing: [winsRow] });
    const report = await h.service.syncLeague({ now: NOW });
    expect(report.changed).toBe(false);
    expect(h.leaguePosts).toEqual([]);
  });

  it("still writes a single score update when several sports change in one run", async () => {
    const twoSports: LeagueData = {
      ...league,
      sports: [
        ...league.sports,
        {
          code: "nba",
          startsOn: "2026-09-07",
          endsOn: null,
          majorPointsCap: null,
          allowsDuplicatePicks: false,
        },
      ],
      rules: [
        ...league.rules,
        {
          sport: "nba",
          code: "win",
          sortOrder: 1,
          rule: { id: "win", label: "Win", points: 4, isChampionship: false, kind: "per_win" },
        },
      ],
      teams: league.teams.map((t) =>
        t.id === "t2"
          ? {
              ...t,
              picks: [
                {
                  sport: "nba" as const,
                  participant: {
                    id: "nba-p1",
                    name: "Hawks",
                    shortName: "ATL",
                    logoUrl: null,
                    primaryColor: null,
                  },
                  baseline: { total: 0, championships: 0, postseasonPoints: 0 },
                  acquiredAt: null,
                },
              ],
            }
          : t,
      ),
    };
    const h = harness({ targets: [target("nfl"), target("nba")], leagueData: twoSports });
    await h.service.syncLeague({ now: NOW });
    const scorePayloads = h.leaguePosts.flatMap((p) =>
      p.payload.type === "score_update" ? [p.payload] : [],
    );
    expect(scorePayloads).toHaveLength(1);
    expect(scorePayloads[0]?.items).toHaveLength(2);
  });

  it("posts the daily movers once, from the previous snapshot", async () => {
    const swapped = {
      previousRanks: [
        { teamId: "t1", rank: 2 },
        { teamId: "t2", rank: 1 },
      ],
    };
    const h = harness({ targets: [target("nfl")], ...swapped });
    await h.service.syncLeague({ now: NOW });
    expect(h.leaguePosts.map((p) => p.body)).toEqual([
      "Scores update: Team +12 (A)",
      "Movers: A ▲1 to 1, B ▼1 to 2",
    ]);

    const again = harness({ targets: [target("nfl")], ...swapped, moversAlreadyPosted: true });
    await again.service.syncLeague({ now: NOW });
    expect(again.leaguePosts.map((p) => p.payload.type)).toEqual(["score_update"]);
  });

  it("does not fail the sync when a league post cannot be written", async () => {
    const h = harness({ targets: [target("nfl")], failPosts: true });
    const report = await h.service.syncLeague({ now: NOW });
    expect(report).toMatchObject({ changed: true, snapshot: "written" });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
});

const freeAgent = (i: number) => ({
  id: `fa${i}`,
  name: `Free agent ${i}`,
  shortName: `F${i}`,
  externalId: `x${i}`,
});
const freeAgents = (count: number) => Array.from({ length: count }, (_, i) => freeAgent(i));
/** Every requested team went 2-0. */
const recordsFor = (request: FactsRequest) =>
  Promise.resolve(
    ok<SportFacts>({
      records: request.externalIds.map((externalId) => ({ externalId, wins: 2, ties: 0 })),
    }),
  );

describe("free agents in the regular run", () => {
  it("scores them with the held participants where the feed is league-wide", async () => {
    const h = harness({
      targets: [
        target("nfl", {
          freeAgents: [{ id: "nfl-fa", name: "Free", shortName: "F", externalId: "99" }],
        }),
      ],
      facts: (_sport, request) => recordsFor(request),
    });
    await h.service.syncLeague({ now: NOW });

    expect(h.factsRequests).toHaveLength(1);
    expect(h.factsRequests[0]?.externalIds).toEqual(["1", "99"]);
    expect(h.applied[0]?.upserts.map((u) => u.participantId).sort()).toEqual(["nfl-fa", "nfl-p1"]);
  });

  it("leaves per-team feeds (college) to the free-agent run, so no extra ESPN calls", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(200) })],
      facts: (_sport, request) => recordsFor(request),
    });
    await h.service.syncLeague({ now: NOW });

    expect(h.factsRequests[0]?.externalIds).toEqual(["1"]);
    expect(h.applied[0]?.upserts.map((u) => u.participantId)).toEqual(["ncaab-p1"]);
  });

  it("never posts a score update for a change that only touched a free agent", async () => {
    const h = harness({
      targets: [
        target("nfl", {
          freeAgents: [{ id: "nfl-fa", name: "Free", shortName: "F", externalId: "99" }],
        }),
      ],
      // The held team's 3 wins are already stored, so only the free agent's row is new.
      existing: [
        {
          id: "r1",
          participantId: "nfl-p1",
          ruleId: "win",
          quantity: 3,
          eventLabel: "",
          source: "espn",
          isLocked: false,
          updatedAt: "2026-09-28T00:00:00Z",
        },
      ],
      facts: () =>
        Promise.resolve(
          ok<SportFacts>({
            records: [
              { externalId: "1", wins: 3, ties: 0 },
              { externalId: "99", wins: 5, ties: 0 },
            ],
          }),
        ),
    });
    const report = await h.service.syncLeague({ now: NOW });

    expect(report.changed).toBe(true);
    expect(h.leaguePosts.filter((p) => p.payload.type === "score_update")).toEqual([]);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("syncFreeAgents", () => {
  it("scores free agents in chunks of 60 and records one free_agents run", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(130) })],
      facts: (_sport, request) => recordsFor(request),
    });
    const report = await h.service.syncFreeAgents({ now: NOW, sport: "ncaab" });

    expect(h.factsRequests.map((r) => r.externalIds.length)).toEqual([60, 60, 10]);
    expect(report).toMatchObject({
      sport: "ncaab",
      changed: true,
      facts: { status: "succeeded", upserted: 130, chunks: 3, failedChunks: 0 },
    });
    expect(h.runs.started).toEqual(["id-ncaab"]);
    expect(h.runs.finished).toHaveLength(1);
    expect(h.runs.finished[0]).toMatchObject({
      status: "succeeded",
      summary: { scope: "free_agents", freeAgents: 130, chunks: 3, correlationId: "corr-1" },
    });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    // No standings snapshot, no feed posts: unheld participants cannot move the leaderboard.
    expect(h.snapshotWrites).toEqual([]);
    expect(h.leaguePosts).toEqual([]);
  });

  it("isolates a failing chunk: the others are still written and the run succeeds", async () => {
    let call = 0;
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(130) })],
      facts: (_sport, request) =>
        call++ === 1
          ? Promise.resolve(err("espn_timeout", "ESPN request failed (espn_timeout)"))
          : recordsFor(request),
    });
    const report = await h.service.syncFreeAgents({ now: NOW, sport: "ncaab" });

    expect(report.facts).toMatchObject({
      status: "succeeded",
      upserted: 70,
      chunks: 3,
      failedChunks: 1,
    });
    expect(h.runs.finished[0]).toMatchObject({
      status: "succeeded",
      summary: { failedChunks: 1, upserted: 70 },
    });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it("treats a chunk that throws like one that fails, without leaking the error", async () => {
    let call = 0;
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(70) })],
      facts: (_sport, request) => {
        if (call++ === 0) throw new Error("connect ECONNREFUSED password=hunter2");
        return recordsFor(request);
      },
    });
    const report = await h.service.syncFreeAgents({ now: NOW, sport: "ncaab" });

    expect(report.facts).toMatchObject({ status: "succeeded", upserted: 10, failedChunks: 1 });
    expect(JSON.stringify(h.runs.finished)).not.toContain("hunter2");
  });

  it("marks the run failed, and drops no cache, when every chunk fails", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(70) })],
      facts: () => Promise.resolve(err("espn_timeout", "ESPN request failed (espn_timeout)")),
    });
    const report = await h.service.syncFreeAgents({ now: NOW, sport: "ncaab" });

    expect(report).toMatchObject({
      changed: false,
      facts: { status: "failed", failedChunks: 2, code: "espn_timeout" },
    });
    expect(h.runs.finished[0]).toMatchObject({
      status: "failed",
      summary: { error: { code: "espn_timeout" } },
    });
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("does nothing for league-wide feeds, outside the season window, or with no pool", async () => {
    const h = harness({
      targets: [
        target("nfl", { freeAgents: freeAgents(5) }),
        target("ncaab", { startsOn: "2026-10-01", freeAgents: freeAgents(5) }),
        target("ncaaf", { freeAgents: [] }),
      ],
    });
    const codes = await Promise.all(
      (["nfl", "ncaab", "ncaaf"] as const).map(
        async (sport) => (await h.service.syncFreeAgents({ now: NOW, sport })).facts.code,
      ),
    );

    expect(codes).toEqual(["league_wide_feed", "before_season_start", "no_free_agents"]);
    expect(h.factsRequests).toEqual([]);
    expect(h.runs.started).toEqual([]);
    expect(h.runs.skipped).toEqual([]);
  });

  it("reports a sport that is not in the active season", async () => {
    const h = harness({ targets: [target("nfl")] });
    const report = await h.service.syncFreeAgents({ now: NOW, sport: "ncaab" });
    expect(report.facts).toMatchObject({ status: "skipped", code: "sport_not_in_season" });
  });
});

describe("refreshParticipants", () => {
  it("writes facts for exactly the named participants and nothing else", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(10) })],
      facts: (_sport, request) => recordsFor(request),
    });
    const result = await h.service.refreshParticipants({
      sport: "ncaab",
      participantIds: ["ncaab-p1", "fa3", "not-a-participant"],
      now: NOW,
    });

    expect(result).toEqual({ ok: true, value: null });
    expect(h.factsRequests[0]?.externalIds).toEqual(["1", "x3"]);
    expect(h.applied[0]?.upserts.map((u) => u.participantId).sort()).toEqual(["fa3", "ncaab-p1"]);
    // A move refresh leaves no trace beyond the facts: the move's caller revalidates.
    expect(h.runs.started).toEqual([]);
    expect(h.runs.finished).toEqual([]);
    expect(h.runs.skipped).toEqual([]);
    expect(h.snapshotWrites).toEqual([]);
    expect(h.leaguePosts).toEqual([]);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("returns the provider's error so the caller can refuse the move", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(2) })],
      facts: () => Promise.resolve(err("espn_timeout", "ESPN request failed (espn_timeout)")),
    });
    const result = await h.service.refreshParticipants({
      sport: "ncaab",
      participantIds: ["fa0"],
      now: NOW,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "espn_timeout", message: "ESPN request failed (espn_timeout)" },
    });
    expect(h.applied).toEqual([]);
  });

  it("succeeds without any ESPN call outside the season window", async () => {
    const h = harness({
      targets: [target("ncaab", { endsOn: "2026-09-27", freeAgents: freeAgents(2) })],
    });
    const result = await h.service.refreshParticipants({
      sport: "ncaab",
      participantIds: ["fa0"],
      now: NOW,
    });
    expect(result).toEqual({ ok: true, value: null });
    expect(h.factsRequests).toEqual([]);
  });

  it("skips participants with no vendor id and fails for a sport outside the season", async () => {
    const h = harness({
      targets: [
        target("ncaab", {
          freeAgents: [{ id: "amateur", name: "Amateur", shortName: "A", externalId: null }],
        }),
      ],
    });
    expect(
      await h.service.refreshParticipants({
        sport: "ncaab",
        participantIds: ["amateur"],
        now: NOW,
      }),
    ).toEqual({ ok: true, value: null });
    expect(h.factsRequests).toEqual([]);

    expect(
      await h.service.refreshParticipants({ sport: "nba", participantIds: ["x"], now: NOW }),
    ).toMatchObject({ ok: false, error: { code: "sport_not_in_season" } });
  });
});

describe("refreshFreeAgents", () => {
  const entry = (externalId: string, name: string) => ({
    externalId,
    name,
    shortName: name,
    logoUrl: null,
    primaryColor: null,
  });

  it("loads new teams, scores the free agents and drops the cache once", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(3) })],
      directory: async () => ok({ entries: [entry("e1", "Duke Blue Devils")], skipped: [] }),
      facts: (_sport, request) => recordsFor(request),
    });
    const report = await h.service.refreshFreeAgents({ now: NOW, sport: "ncaab" });

    expect(h.insertedRows.flat()).toEqual([
      expect.objectContaining({ sportId: "id-ncaab", espnId: "e1", name: "Duke Blue Devils" }),
    ]);
    expect(report).toMatchObject({
      changed: true,
      roster: { status: "succeeded", inserted: 1, skipped: 0 },
      facts: { status: "succeeded", upserted: 3 },
    });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it("drops the cache when only new participants were inserted (pro sports have no facts step)", async () => {
    const h = harness({
      targets: [target("nfl")],
      directory: async () => ok({ entries: [entry("e1", "Chicago Bears")], skipped: [] }),
    });
    const report = await h.service.refreshFreeAgents({ now: NOW, sport: "nfl" });

    expect(report).toMatchObject({ changed: true, facts: { code: "league_wide_feed" } });
    expect(h.factsRequests).toEqual([]);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not drop the cache on a re-run that inserts and changes nothing", async () => {
    const h = harness({
      targets: [target("nfl")],
      stored: [{ id: "p", name: "Chicago Bears", espnId: "e1" }],
      directory: async () => ok({ entries: [entry("e1", "Chicago Bears")], skipped: [] }),
    });
    const report = await h.service.refreshFreeAgents({ now: NOW, sport: "nfl" });

    expect(report.roster).toEqual({ status: "succeeded", inserted: 0, skipped: 0 });
    expect(report.changed).toBe(false);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("still scores stored free agents when the directory call fails", async () => {
    const h = harness({
      targets: [target("ncaab", { freeAgents: freeAgents(2) })],
      directory: async () => err("espn_timeout", "ESPN request failed (espn_timeout)"),
      facts: (_sport, request) => recordsFor(request),
    });
    const report = await h.service.refreshFreeAgents({ now: NOW, sport: "ncaab" });

    expect(report.roster).toEqual({ status: "failed", code: "espn_timeout" });
    expect(report.facts).toMatchObject({ status: "succeeded", upserted: 2 });
    expect(h.insertedRows).toEqual([]);
  });
});
