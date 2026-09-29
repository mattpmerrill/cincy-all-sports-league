import type { LeagueData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import type { ParticipantResultRow, ResultUpsert } from "@/data/participant-results.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import type { SnapshotWrite } from "@/data/standings-snapshots.repository";
import type { Json } from "@/data/database.types";
import type { SyncRunRow } from "@/data/sync-runs.repository";
import type { Logger } from "@/lib/logger";
import { easternDate } from "@/lib/time";
import { planSportSync, type SyncPlan } from "./plan";
import type { ResultsProvider } from "./results-provider";
import { computeSnapshotRows } from "./snapshot";

/** The persistence the service needs; `sync.server.ts` satisfies it with the secret-key client. */
export type SyncDeps = {
  provider: ResultsProvider;
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

const CONCURRENCY = 4;
/** Longer than the route's 60s limit: anything still "running" past this was killed. */
const STALE_RUN_MS = 5 * 60_000;

export type SyncService = ReturnType<typeof createSyncService>;

export function createSyncService(deps: SyncDeps) {
  async function syncSport(
    target: SportTarget,
    now: Date,
    today: string,
    latest: SyncRunRow | undefined,
    correlationId: string,
    log: Logger,
  ): Promise<SportOutcome> {
    const sport = target.sport;
    const outcome = (o: Omit<SportOutcome, "sport">): SportOutcome => ({ sport, ...o });

    const outside =
      today < target.startsOn
        ? "before_season_start"
        : today > target.seasonEndsOn
          ? "after_season_end"
          : null;
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
      const externalIds = target.participants.flatMap((p) => (p.externalId ? [p.externalId] : []));
      const facts = await deps.provider.fetchFacts({
        sport,
        season: target.espnSeason,
        externalIds,
      });
      if (!facts.ok) {
        log.warn("provider failed", { sport, code: facts.error.code });
        return await finish(
          "failed",
          { error: { code: facts.error.code, message: facts.error.message } },
          { upserted: 0, deleted: 0, code: facts.error.code },
        );
      }

      const existing = await deps.results.listForParticipants(
        target.seasonId,
        target.participants.map((p) => p.id),
      );
      const plan = planSportSync({
        rules: target.rules,
        participants: target.participants,
        existing,
        facts: facts.value,
      });
      if (!plan.ok) {
        log.error("plan failed", { sport, code: plan.error.code, message: plan.error.message });
        return await finish(
          "failed",
          { error: { code: plan.error.code, message: plan.error.message } },
          { upserted: 0, deleted: 0, code: plan.error.code },
        );
      }

      const applied = await deps.results.applyChanges(
        target.seasonId,
        plan.value.upserts,
        plan.value.deleteIds,
      );
      log.info("sport synced", { sport, ...applied, unchanged: plan.value.unchanged });
      return await finish("succeeded", summaryOf(plan.value, applied), applied);
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

  async function writeSnapshot(
    seasonId: string,
    today: string,
    log: Logger,
  ): Promise<SyncReport["snapshot"]> {
    try {
      const data = await deps.league.load();
      if (!data) return "not_needed";
      await deps.snapshots.upsertDay(seasonId, today, computeSnapshotRows(data));
      return "written";
    } catch (error) {
      log.error("snapshot failed", { error });
      return "failed";
    }
  }

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

      const outcomes = await mapPool(targets, CONCURRENCY, (target) =>
        syncSport(
          target,
          now,
          today,
          latest.get(target.sportId),
          correlationId,
          log.child({ sport: target.sport }),
        ),
      );

      const changed = outcomes.some((o) => o.upserted + o.deleted > 0);
      let snapshot: SyncReport["snapshot"] = "not_needed";
      if (changed) {
        snapshot = await writeSnapshot(first.seasonId, today, log);
        deps.invalidate();
      }
      log.info("sync finished", { changed, snapshot, sports: outcomes.length });
      return { correlationId, date: today, sports: outcomes, changed, snapshot };
    },
  };
}

function summaryOf(plan: SyncPlan, applied: { upserted: number; deleted: number }) {
  return {
    upserted: applied.upserted,
    deleted: applied.deleted,
    unchanged: plan.unchanged,
    unmatchedExternalIds: plan.unmatchedExternalIds,
    missingExternalIds: plan.missingExternalIdCount,
  };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping result order. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
