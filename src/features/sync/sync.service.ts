import type { LeagueData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import type { ParticipantResultRow, ResultUpsert } from "@/data/participant-results.repository";
import type { SportTarget, TargetParticipant } from "@/data/sport-targets.repository";
import type { SnapshotWrite } from "@/data/standings-snapshots.repository";
import type { Json } from "@/data/database.types";
import type { SyncRunRow } from "@/data/sync-runs.repository";
import type { Logger } from "@/lib/logger";
import { mapPool } from "@/lib/map-pool";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { easternDate } from "@/lib/time";
import { buildMoversPost, buildScoreUpdatePost, type LeaguePost } from "@/domain/feed";
import { planSportSync, type SyncPlan } from "./plan";
import type { ProviderError, ResultsProvider } from "./results-provider";
import { refreshRoster, type RosterDeps } from "./roster";
import { computeScoreChanges, planChanges, type ParticipantChange } from "./score-changes";
import { computeSnapshotRows } from "./snapshot";

/** The persistence the service needs; `sync.server.ts` satisfies it with the secret-key client. */
export type SyncDeps = {
  provider: ResultsProvider;
  /** Who exists in a sport; feeds the free-agent pool. */
  directory: RosterDeps["directory"];
  participants: RosterDeps["participants"];
  targets: { listSportTargets(only?: readonly SportCode[]): Promise<SportTarget[]> };
  results: {
    listForParticipants(
      seasonId: string,
      participantIds: readonly string[],
    ): Promise<ParticipantResultRow[]>;
    applyChanges(
      seasonId: string,
      upserts: readonly ResultUpsert[],
      deleteIds: readonly string[],
    ): Promise<{ upserted: number; deleted: number }>;
  };
  runs: {
    start(sportId: string, now: Date): Promise<string>;
    finish(id: string, status: "succeeded" | "failed", summary: Json, now: Date): Promise<void>;
    recordSkipped(sportId: string, summary: Json, now: Date): Promise<void>;
    failStale(startedBefore: Date, now: Date): Promise<number>;
    latestForSports(sportIds: readonly string[]): Promise<Map<string, SyncRunRow>>;
  };
  snapshots: {
    upsertDay(seasonId: string, date: string, rows: readonly SnapshotWrite[]): Promise<void>;
    /** Ranks from the latest day before `date`, to spot movers. Empty without history. */
    latestBefore(seasonId: string, date: string): Promise<{ teamId: string; rank: number }[]>;
  };
  /** Automatic feed posts. Injected so sync tests stay pure; production writes with the secret key. */
  posts: {
    write(seasonId: string, post: LeaguePost): Promise<void>;
    /** Movers are a daily post: true when today's is already written. */
    hasMoversPost(seasonId: string, date: string): Promise<boolean>;
  };
  league: { load(): Promise<LeagueData | null> };
  /** Drops the cached public read model (`revalidateLeague`). Injected so tests need no Next. */
  invalidate: () => void;
  logger: Logger;
  newCorrelationId: () => string;
};

export type SportOutcome = {
  sport: SportCode;
  status: "succeeded" | "failed" | "skipped";
  upserted: number;
  deleted: number;
  /** Stable machine code when failed or skipped. */
  code?: string;
};

export type SyncReport = {
  correlationId: string;
  date: string;
  sports: SportOutcome[];
  changed: boolean;
  snapshot: "written" | "not_needed" | "failed";
};

export type SyncOptions = { now: Date; sports?: readonly SportCode[] };

export type FreeAgentFactsOutcome = {
  status: "succeeded" | "failed" | "skipped";
  upserted: number;
  deleted: number;
  chunks: number;
  failedChunks: number;
  /** Stable machine code when failed or skipped. */
  code?: string;
};

export type RosterOutcome =
  { status: "succeeded"; inserted: number; skipped: number } | { status: "failed"; code: string };

export type FreeAgentsReport = {
  correlationId: string;
  sport: SportCode;
  /** Absent when only the facts were refreshed (`syncFreeAgents`). */
  roster?: RosterOutcome;
  facts: FreeAgentFactsOutcome;
  /** True when anything was written, so the public cache was dropped. */
  changed: boolean;
};

const CONCURRENCY = 4;
/**
 * Free agents are scored a chunk at a time: a college feed costs one ESPN call per team, and a
 * single failed call used to fail the whole fetch. 60 keeps a chunk to a few seconds and a
 * failure to a fraction of the pool.
 */
const FREE_AGENT_CHUNK = 60;
/** Longer than the route's 60s limit: anything still "running" past this was killed. */
const STALE_RUN_MS = 5 * 60_000;

export type SyncService = ReturnType<typeof createSyncService>;

type FactsRun =
  | {
      ok: true;
      existing: ParticipantResultRow[];
      plan: SyncPlan;
      applied: { upserted: number; deleted: number };
    }
  | { ok: false; stage: "provider" | "plan"; error: AppError };

const outsideWindow = (target: SportTarget, today: string) =>
  today < target.startsOn
    ? ("before_season_start" as const)
    : today > target.endsOn
      ? ("after_season_end" as const)
      : null;

export function createSyncService(deps: SyncDeps) {
  /**
   * The one facts pipeline: fetch, plan against what is stored, write. Regular runs, the
   * free-agent chunks and the pre-move refresh all go through it, so a rule (locks, milestones
   * only ever added) cannot differ between them.
   */
  async function applyFacts(
    target: SportTarget,
    participants: readonly TargetParticipant[],
  ): Promise<FactsRun> {
    const facts = await deps.provider.fetchFacts({
      sport: target.sport,
      season: target.espnSeason,
      externalIds: participants.flatMap((p) => (p.externalId ? [p.externalId] : [])),
    });
    if (!facts.ok) return { ok: false, stage: "provider", error: facts.error };

    const existing = await deps.results.listForParticipants(
      target.seasonId,
      participants.map((p) => p.id),
    );
    const plan = planSportSync({
      rules: target.rules,
      participants,
      existing,
      facts: facts.value,
    });
    if (!plan.ok) return { ok: false, stage: "plan", error: plan.error };

    const applied = await deps.results.applyChanges(
      target.seasonId,
      plan.value.upserts,
      plan.value.deleteIds,
    );
    return { ok: true, existing, plan: plan.value, applied };
  }

  async function syncSport(
    target: SportTarget,
    now: Date,
    today: string,
    latest: SyncRunRow | undefined,
    correlationId: string,
    log: Logger,
    changeSink: ParticipantChange[],
  ): Promise<SportOutcome> {
    const sport = target.sport;
    const outcome = (o: Omit<SportOutcome, "sport">): SportOutcome => ({ sport, ...o });

    const outside = outsideWindow(target, today);
    if (outside) {
      // 11 sports x every 30 minutes would bury the useful rows; one skip note per day is enough.
      const alreadyNoted =
        latest?.status === "skipped" && easternDate(new Date(latest.startedAt)) === today;
      if (!alreadyNoted) await deps.runs.recordSkipped(target.sportId, { reason: outside }, now);
      return outcome({ status: "skipped", upserted: 0, deleted: 0, code: outside });
    }

    const startedAt = Date.now();
    const runId = await deps.runs.start(target.sportId, now);
    const finish = (
      status: "succeeded" | "failed",
      summary: Record<string, Json>,
      done: Omit<SportOutcome, "sport" | "status">,
    ) =>
      deps.runs
        .finish(
          runId,
          status,
          { ...summary, correlationId, durationMs: Date.now() - startedAt },
          new Date(),
        )
        .then(() => outcome({ status, ...done }));

    try {
      // A league-wide feed (pro standings, rankings) returns free agents in the same response as
      // the held participants, so scoring them adds database work but no ESPN calls. Per-team
      // feeds (college) would cost a call each: those free agents have their own daily run.
      const scored = deps.provider.fetchesPerParticipant(sport)
        ? target.participants
        : [...target.participants, ...target.freeAgents];
      const run = await applyFacts(target, scored);
      if (!run.ok) {
        const { code, message } = run.error;
        if (run.stage === "provider") log.warn("provider failed", { sport, code });
        else log.error("plan failed", { sport, code, message });
        return await finish(
          "failed",
          { error: { code, message } },
          { upserted: 0, deleted: 0, code },
        );
      }

      const { applied, plan, existing } = run;
      if (applied.upserted + applied.deleted > 0) {
        changeSink.push(...planChanges(sport, existing, plan.upserts, plan.deleteIds));
      }
      log.info("sport synced", { sport, ...applied, unchanged: plan.unchanged });
      return await finish("succeeded", summaryOf(plan, applied), applied);
    } catch (error) {
      // Details go to the log; sync_runs is publicly readable, so it gets a fixed message.
      log.error("sport sync crashed", { sport, error });
      return await finish(
        "failed",
        {
          error: {
            code: "unexpected",
            message: "Unexpected error. The server log has the details under this correlation id.",
          },
        },
        { upserted: 0, deleted: 0, code: "unexpected" },
      ).catch(() => outcome({ status: "failed", upserted: 0, deleted: 0, code: "unexpected" }));
    }
  }

  async function loadLeague(log: Logger): Promise<LeagueData | null | "failed"> {
    try {
      return await deps.league.load();
    } catch (error) {
      log.error("league load failed", { error });
      return "failed";
    }
  }

  async function writeSnapshot(
    seasonId: string,
    today: string,
    data: LeagueData | null | "failed",
    log: Logger,
  ): Promise<SyncReport["snapshot"]> {
    if (data === "failed") return "failed";
    try {
      if (!data) return "not_needed";
      await deps.snapshots.upsertDay(seasonId, today, computeSnapshotRows(data));
      return "written";
    } catch (error) {
      log.error("snapshot failed", { error });
      return "failed";
    }
  }

  /**
   * League posts are a courtesy: a failure here is logged and never fails the sync. At most one
   * score update per run, and one movers post per day (a later same-day sync with more rank
   * changes does not add another).
   */
  async function postLeagueUpdates(
    seasonId: string,
    today: string,
    data: LeagueData,
    changes: readonly ParticipantChange[],
    log: Logger,
  ): Promise<void> {
    try {
      const scorePost = buildScoreUpdatePost(computeScoreChanges(data, changes));
      if (scorePost) await deps.posts.write(seasonId, scorePost);
    } catch (error) {
      log.error("score update post failed", { error });
    }
    try {
      if (await deps.posts.hasMoversPost(seasonId, today)) return;
      const prev = await deps.snapshots.latestBefore(seasonId, today);
      const curr = computeSnapshotRows(data).flatMap((row) => {
        const team = data.teams.find((t) => t.id === row.teamId);
        return team
          ? [{ teamId: row.teamId, teamSlug: team.slug, teamName: team.name, rank: row.rank }]
          : [];
      });
      const moversPost = buildMoversPost(prev, curr, today);
      if (moversPost) await deps.posts.write(seasonId, moversPost);
    } catch (error) {
      log.error("movers post failed", { error });
    }
  }

  const factsOutcome = (
    status: FreeAgentFactsOutcome["status"],
    over: Partial<FreeAgentFactsOutcome> = {},
  ): FreeAgentFactsOutcome => ({
    status,
    upserted: 0,
    deleted: 0,
    chunks: 0,
    failedChunks: 0,
    ...over,
  });

  /**
   * Scores the free agents of a per-team-feed sport (college), a chunk at a time, inside the
   * season window. Pro sports, WTA and PGA are skipped here: their regular run already covers
   * free agents at no extra ESPN cost. Writes one `sync_runs` row (scope "free_agents"), but no
   * snapshot and no posts: unheld participants cannot move the standings. Does not invalidate the
   * cache; callers do, once, when anything changed.
   */
  async function runFreeAgentFacts(
    target: SportTarget,
    now: Date,
    correlationId: string,
    log: Logger,
  ): Promise<FreeAgentFactsOutcome> {
    const sport = target.sport;
    if (!deps.provider.fetchesPerParticipant(sport)) {
      return factsOutcome("skipped", { code: "league_wide_feed" });
    }
    const outside = outsideWindow(target, easternDate(now));
    if (outside) return factsOutcome("skipped", { code: outside });

    const pool = target.freeAgents.filter((p) => p.externalId);
    if (pool.length === 0) return factsOutcome("skipped", { code: "no_free_agents" });

    const startedAt = Date.now();
    const runId = await deps.runs.start(target.sportId, now);
    const chunks: TargetParticipant[][] = [];
    for (let i = 0; i < pool.length; i += FREE_AGENT_CHUNK) {
      chunks.push(pool.slice(i, i + FREE_AGENT_CHUNK));
    }

    let upserted = 0;
    let deleted = 0;
    let unchanged = 0;
    let failedChunks = 0;
    let lastError: AppError | null = null;
    for (const [index, chunk] of chunks.entries()) {
      // One bad chunk (a flaky ESPN call, a scoring rule missing) costs 60 teams a day of
      // freshness, not the whole sport. Details go to the log, never to the public run row.
      try {
        const run = await applyFacts(target, chunk);
        if (!run.ok) {
          failedChunks += 1;
          lastError = run.error;
          log.warn("free-agent chunk failed", { sport, chunk: index, code: run.error.code });
          continue;
        }
        upserted += run.applied.upserted;
        deleted += run.applied.deleted;
        unchanged += run.plan.unchanged;
      } catch (error) {
        failedChunks += 1;
        lastError = { code: "unexpected", message: "Unexpected error." };
        log.error("free-agent chunk crashed", { sport, chunk: index, error });
      }
    }

    const status = failedChunks === chunks.length ? "failed" : "succeeded";
    await deps.runs.finish(
      runId,
      status,
      {
        scope: "free_agents",
        freeAgents: pool.length,
        chunks: chunks.length,
        failedChunks,
        upserted,
        deleted,
        unchanged,
        ...(lastError && status === "failed"
          ? { error: { code: lastError.code, message: lastError.message } }
          : {}),
        correlationId,
        durationMs: Date.now() - startedAt,
      },
      new Date(),
    );
    log.info("free agents synced", {
      sport,
      chunks: chunks.length,
      failedChunks,
      upserted,
      deleted,
    });
    return factsOutcome(status, {
      upserted,
      deleted,
      chunks: chunks.length,
      failedChunks,
      ...(status === "failed" && lastError ? { code: lastError.code } : {}),
    });
  }

  async function targetFor(sport: SportCode): Promise<SportTarget | null> {
    return (await deps.targets.listSportTargets([sport]))[0] ?? null;
  }

  const notInSeason = (correlationId: string, sport: SportCode): FreeAgentsReport => ({
    correlationId,
    sport,
    facts: factsOutcome("skipped", { code: "sport_not_in_season" }),
    changed: false,
  });

  return {
    /**
     * Syncs every sport whose season window is open (or just `sports`). A failing sport records a
     * failed run and never stops the others. If anything changed, writes today's standings
     * snapshot and then drops the public cache so pages show the new results.
     */
    async syncLeague({ now, sports }: SyncOptions): Promise<SyncReport> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId });
      const today = easternDate(now);

      const targets = await deps.targets.listSportTargets(sports);
      const empty: SyncReport = {
        correlationId,
        date: today,
        sports: [],
        changed: false,
        snapshot: "not_needed",
      };
      const first = targets[0];
      if (!first) return empty;

      await deps.runs.failStale(new Date(now.getTime() - STALE_RUN_MS), now);
      const latest = await deps.runs.latestForSports(targets.map((t) => t.sportId));

      const changeSink: ParticipantChange[] = [];
      const outcomes = await mapPool(targets, CONCURRENCY, (target) =>
        syncSport(
          target,
          now,
          today,
          latest.get(target.sportId),
          correlationId,
          log.child({ sport: target.sport }),
          changeSink,
        ),
      );

      const changed = outcomes.some((o) => o.upserted + o.deleted > 0);
      let snapshot: SyncReport["snapshot"] = "not_needed";
      if (changed) {
        const data = await loadLeague(log);
        snapshot = await writeSnapshot(first.seasonId, today, data, log);
        if (data && data !== "failed") {
          await postLeagueUpdates(first.seasonId, today, data, changeSink, log);
        }
        deps.invalidate();
      }
      log.info("sync finished", { changed, snapshot, sports: outcomes.length });
      return { correlationId, date: today, sports: outcomes, changed, snapshot };
    },

    /**
     * Scores one sport's free agents on their own (college sports; others are skipped because the
     * regular run covers them). Drops the public cache if anything changed.
     */
    async syncFreeAgents({ now, sport }: FreeAgentsOptions): Promise<FreeAgentsReport> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId, sport });
      const target = await targetFor(sport);
      if (!target) return notInSeason(correlationId, sport);

      const outcome = await runFreeAgentFacts(target, now, correlationId, log);
      const changed = outcome.upserted + outcome.deleted > 0;
      if (changed) deps.invalidate();
      return { correlationId, sport, facts: outcome, changed };
    },

    /**
     * The daily pool job for one sport: load whoever ESPN lists that we do not store yet, then
     * score the free agents (college only). A failed directory call does not stop the scoring of
     * free agents already stored, and the cache is dropped once, only if something was written.
     */
    async refreshFreeAgents({ now, sport }: FreeAgentsOptions): Promise<FreeAgentsReport> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId, sport });
      const target = await targetFor(sport);
      if (!target) return notInSeason(correlationId, sport);

      let roster: RosterOutcome;
      // A crash can land after a partial insert, so the inserted count is unknown and the cache
      // must be dropped anyway.
      let rosterCrashed = false;
      try {
        const loaded = await refreshRoster({ ...deps, logger: log }, target);
        roster = loaded.ok
          ? { status: "succeeded", ...loaded.value }
          : { status: "failed", code: loaded.error.code };
        if (!loaded.ok) log.warn("roster refresh failed", { code: loaded.error.code });
      } catch (error) {
        log.error("roster refresh crashed", { error });
        roster = { status: "failed", code: "unexpected" };
        rosterCrashed = true;
      }

      // Newly inserted free agents must be in the target the facts step reads.
      const inserted = roster.status === "succeeded" ? roster.inserted : 0;
      const current = inserted > 0 ? ((await targetFor(sport)) ?? target) : target;

      const outcome = await runFreeAgentFacts(current, now, correlationId, log);
      const changed = inserted > 0 || rosterCrashed || outcome.upserted + outcome.deleted > 0;
      if (changed) deps.invalidate();
      return { correlationId, sport, roster, facts: outcome, changed };
    },

    /**
     * Brings exactly these participants' facts up to date, through the same pipeline as a regular
     * run. Used right before a free-agent move, so a stale college record cannot leak into a
     * baseline. Outside the season window there is nothing to fetch, so it succeeds at once.
     * Writes no `sync_runs` row, posts or snapshot and does not touch the cache: the caller
     * revalidates after the move it is part of.
     */
    async refreshParticipants({
      sport,
      participantIds,
      now,
    }: RefreshParticipantsOptions): Promise<Result<null, ProviderError>> {
      const target = await targetFor(sport);
      if (!target) return err("sport_not_in_season", `${sport} is not part of the active season`);
      if (outsideWindow(target, easternDate(now))) return ok(null);

      const wanted = new Set(participantIds);
      const participants = [...target.participants, ...target.freeAgents].filter(
        (p) => wanted.has(p.id) && p.externalId,
      );
      if (participants.length === 0) return ok(null);

      const run = await applyFacts(target, participants);
      return run.ok ? ok(null) : { ok: false, error: run.error };
    },
  };
}

export type FreeAgentsOptions = { now: Date; sport: SportCode };
export type RefreshParticipantsOptions = {
  sport: SportCode;
  participantIds: readonly string[];
  now: Date;
};

function summaryOf(plan: SyncPlan, applied: { upserted: number; deleted: number }) {
  return {
    upserted: applied.upserted,
    deleted: applied.deleted,
    unchanged: plan.unchanged,
    unmatchedExternalIds: plan.unmatchedExternalIds,
    missingExternalIds: plan.missingExternalIdCount,
  };
}
