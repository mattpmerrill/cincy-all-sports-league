import type { GameWrite, UpsertGamesSummary } from "@/data/games.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import { addDays, easternDateOf, easternWeekStart, stepWeek } from "@/domain/calendar";
import { GAME_SPORTS } from "@/domain/schedule";
import type { SportCode } from "@/domain/sports/sports";
import {
  isPerTeamRecordsSport,
  type EspnError,
  type GamesWindow,
  type ScheduledGame,
  type ScheduledGamesFeed,
  type ScheduledGamesRequest,
} from "@/integrations/espn";
import type { Logger } from "@/lib/logger";
import { mapPool } from "@/lib/map-pool";
import type { Result } from "@/lib/result";
import type { GamesRange } from "./schemas";

/** The ESPN call, injected so tests need no network: `fetchScheduledGames` in production. */
export type FetchGames = (
  sport: SportCode,
  request: ScheduledGamesRequest,
) => Promise<Result<ScheduledGamesFeed, EspnError>>;

export type GamesSyncDeps = {
  targets: { listSportTargets(only?: readonly SportCode[]): Promise<SportTarget[]> };
  games: {
    upsertGames(
      target: { seasonId: string; sportId: string },
      games: readonly GameWrite[],
    ): Promise<UpsertGamesSummary>;
  };
  fetchGames: FetchGames;
  /** Drops the cached games (`revalidateGames`). Injected so tests need no Next. */
  invalidate: () => void;
  logger: Logger;
  newCorrelationId: () => string;
};

export type GamesSportOutcome = {
  sport: SportCode;
  status: "succeeded" | "failed" | "skipped";
  /** Games ESPN returned for the window. */
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** ESPN calls that failed after retries in an otherwise successful run. */
  failedRequests: number;
  /** Stable machine code when failed or skipped. */
  code?: string;
};

export type GamesSyncReport = {
  correlationId: string;
  range: GamesRange;
  window: GamesWindow;
  sports: GamesSportOutcome[];
  /** True when anything was written, so the public games cache was dropped. */
  changed: boolean;
};

/**
 * Sports in flight at once. Each sport already makes up to six ESPN calls at a time, so this
 * bounds the whole run to a few dozen requests rather than letting eleven sports pile on.
 */
const CONCURRENCY = 3;

/**
 * The Eastern days a refresh covers. `live` is yesterday and today: a game that finished after
 * midnight, and the day being played. `weeks` is the current week and the next, Monday to Sunday:
 * the weeks people actually open, so the page is full before they do and a moved game follows.
 */
export function gamesWindow(range: GamesRange, now: Date): GamesWindow {
  const today = easternDateOf(now);
  if (range === "live") return { from: addDays(today, -1), to: today };
  const thisWeek = easternWeekStart(now);
  return { from: thisWeek, to: addDays(stepWeek(thisWeek, 1), 6) };
}

const toWrite = (game: ScheduledGame): GameWrite => ({
  externalId: game.espnEventId,
  startsAt: game.startsAt,
  timeTbd: game.timeTbd,
  status: game.status,
  statusDetail: game.statusDetail,
  note: game.note,
  neutralSite: game.neutralSite,
  home: {
    externalId: game.home.espnTeamId,
    name: game.home.name,
    shortName: game.home.shortName,
    score: game.home.score,
    winner: game.home.winner,
  },
  away: {
    externalId: game.away.espnTeamId,
    name: game.away.name,
    shortName: game.away.shortName,
    score: game.away.score,
    winner: game.away.winner,
  },
});

/**
 * A sport is worth asking ESPN about when its season window touches the days being refreshed, not
 * only when today is inside it: the daily `weeks` run should already have the opening week of a
 * sport that starts on Thursday. Sports that are over or not yet within two weeks of starting
 * cost no ESPN call at all.
 */
const touchesWindow = (target: SportTarget, window: GamesWindow): boolean =>
  target.startsOn <= window.to && target.endsOn >= window.from;

export type GamesSyncService = ReturnType<typeof createGamesSyncService>;

export function createGamesSyncService(deps: GamesSyncDeps) {
  async function refreshSport(
    target: SportTarget,
    window: GamesWindow,
    log: Logger,
  ): Promise<GamesSportOutcome> {
    const sport = target.sport;
    const outcome = (o: Partial<GamesSportOutcome> & Pick<GamesSportOutcome, "status">) => ({
      sport,
      fetched: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failedRequests: 0,
      ...o,
    });

    try {
      if (!touchesWindow(target, window)) {
        return outcome({ status: "skipped", code: "outside_season" });
      }

      // College feeds are one call per team, so they ask only for teams somebody holds.
      const college = isPerTeamRecordsSport(sport);
      const espnTeamIds = college
        ? target.participants.flatMap((p) => (p.externalId ? [p.externalId] : []))
        : undefined;
      if (college && espnTeamIds?.length === 0) {
        return outcome({ status: "skipped", code: "no_held_teams" });
      }

      const feed = await deps.fetchGames(sport, {
        window,
        espnSeason: target.espnSeason,
        espnTeamIds,
      });
      if (!feed.ok) {
        log.warn("games feed failed", { sport, code: feed.error.code });
        return outcome({ status: "failed", code: feed.error.code });
      }
      if (feed.value.failedRequests > 0) {
        log.warn("games feed partly failed", {
          sport,
          failedRequests: feed.value.failedRequests,
          requests: feed.value.requests,
        });
      }

      const summary = await deps.games.upsertGames(
        { seasonId: target.seasonId, sportId: target.sportId },
        feed.value.games.map(toWrite),
      );
      return outcome({
        status: "succeeded",
        fetched: feed.value.games.length,
        inserted: summary.inserted,
        updated: summary.updated,
        unchanged: summary.unchanged,
        failedRequests: feed.value.failedRequests,
      });
    } catch (error) {
      // One sport's database or parsing failure must not stop the others.
      log.error("games refresh failed", { sport, error });
      return outcome({ status: "failed", code: "unexpected" });
    }
  }

  return {
    /**
     * Refreshes the stored games of every in-season team sport for the range's days. Idempotent:
     * rerunning it, or two runs overlapping, writes the same rows. Per-sport failures are
     * isolated and reported; only a failure to read the league's targets throws.
     */
    async refreshGames(input: { now: Date; range: GamesRange }): Promise<GamesSyncReport> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId, range: input.range });
      const window = gamesWindow(input.range, input.now);

      const targets = await deps.targets.listSportTargets(GAME_SPORTS);
      const sports = await mapPool(targets, CONCURRENCY, (target) =>
        refreshSport(target, window, log),
      );

      const changed = sports.some((s) => s.inserted + s.updated > 0);
      // A sport that threw may have written some batches before it did, so it also drops the cache.
      if (changed || sports.some((s) => s.code === "unexpected")) deps.invalidate();

      log.info("games refresh finished", {
        window,
        changed,
        succeeded: sports.filter((s) => s.status === "succeeded").length,
        failed: sports.filter((s) => s.status === "failed").length,
        skipped: sports.filter((s) => s.status === "skipped").length,
        inserted: sports.reduce((sum, s) => sum + s.inserted, 0),
        updated: sports.reduce((sum, s) => sum + s.updated, 0),
        failedRequests: sports.reduce((sum, s) => sum + s.failedRequests, 0),
      });
      return { correlationId, range: input.range, window, sports, changed };
    },
  };
}
