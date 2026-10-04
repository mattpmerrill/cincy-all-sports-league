import type { MatchupsRepository } from "@/data/matchups.repository";
import type { LeaguePost, MatchupsWeekOutcome, MatchupsWeekResult } from "@/domain/feed";
import { buildMatchupsWeekPost } from "@/domain/feed";
import { buildLeagueModel } from "@/domain/league";
import type { LeagueData, StandingRow } from "@/domain/league";
import {
  REMATCH_WEEKS,
  matchupStatus,
  pairByStandings,
  rolloverAction,
  rolloverWindow,
  scoreMatchup,
  waitsForMonday,
} from "@/domain/matchups";
import type { Matchup, MatchupError, MatchupLeader } from "@/domain/matchups";
import type { Logger } from "@/lib/logger";
import type { Result } from "@/lib/result";
import { easternDate } from "@/lib/time";

export type RolloverDeps = {
  league: {
    /** The whole league read fresh (never the cache) with the admin client; null before a season. */
    loadFresh(): Promise<LeagueData | null>;
  };
  matchups: Pick<MatchupsRepository, "listSeason" | "listRecentPairs" | "rollWeek">;
  /** League feed posts. Production writes with the secret key (RLS has no policy for anyone else). */
  posts: { write(seasonId: string, post: LeaguePost): Promise<void> };
  /** Drops the cached matchups (`revalidateMatchups`). Injected so tests need no Next. */
  revalidate: () => void;
  logger: Logger;
  newCorrelationId: () => string;
};

/**
 * Why a run did nothing, in the order the checks run:
 * - `not_due`: before Monday 06:30 Eastern.
 * - `no_season`: no active season.
 * - `outside_season`: the week is before the season's first week.
 * - `waiting_for_monday`: the season has no matchups yet and today is not a Monday, so the first
 *   week waits instead of opening part-way through.
 * - `nothing_open`: a week after the season's last, and no matchup is still open to close.
 * - `already_rolled`: the database already had this week (an earlier run did the work).
 */
export const ROLLOVER_SKIP_REASONS = [
  "not_due",
  "no_season",
  "outside_season",
  "waiting_for_monday",
  "nothing_open",
  "already_rolled",
] as const;
export type RolloverSkipReason = (typeof ROLLOVER_SKIP_REASONS)[number];

/** `written` and `none` are both fine: `none` means there was nothing to say. */
export type RolloverPostStatus = "written" | "none" | "failed";

export type RolloverReport =
  | {
      status: "skipped";
      reason: RolloverSkipReason;
      correlationId: string;
      /** The Eastern week the run was for. */
      weekStart: string;
    }
  | {
      status: "done";
      correlationId: string;
      weekStart: string;
      /** `pair` opened the week; `close_only` only closed what was open (after the season). */
      action: "pair" | "close_only";
      finalized: number;
      created: number;
      /** The team left without a matchup when the field is odd; null otherwise. Its id only. */
      byeTeamId: string | null;
      post: RolloverPostStatus;
    };

// The feed names the outcome from the home side, and calls a draw "tie"; the scorer calls it "tied".
const OUTCOME: Record<MatchupLeader, MatchupsWeekOutcome> = {
  home: "home",
  away: "away",
  tied: "tie",
};

export type MatchupsRolloverService = ReturnType<typeof createMatchupsRolloverService>;

export function createMatchupsRolloverService(deps: RolloverDeps) {
  /**
   * Last week's results as the feed shows them: each matchup just closed, scored from its frozen
   * start and the totals this run wrote as its end. Ordered by the better season rank of the two
   * teams so the post reads top of the table first.
   */
  function closedResults(
    closed: readonly Matchup[],
    totals: ReadonlyMap<string, number>,
    teams: ReadonlyMap<string, StandingRow>,
  ): MatchupsWeekResult[] {
    const results: { rank: number; result: MatchupsWeekResult }[] = [];
    for (const m of closed) {
      const homeEnd = totals.get(m.home.teamId);
      const awayEnd = totals.get(m.away.teamId);
      const home = teams.get(m.home.teamId);
      const away = teams.get(m.away.teamId);
      if (homeEnd === undefined || awayEnd === undefined || !home || !away) continue;
      const scored = scoreMatchup(
        {
          ...m,
          home: { ...m.home, endPoints: homeEnd },
          away: { ...m.away, endPoints: awayEnd },
        },
        totals,
      );
      if (scored.state !== "final") continue;
      results.push({
        rank: Math.min(home.rank, away.rank),
        result: {
          home: { name: home.teamName, slug: home.slug },
          away: { name: away.teamName, slug: away.slug },
          homeGain: scored.home.gain,
          awayGain: scored.away.gain,
          outcome: OUTCOME[scored.leader],
        },
      });
    }
    return results.sort((a, b) => a.rank - b.rank).map((r) => r.result);
  }

  /**
   * The Monday post is a courtesy, written only on the run whose rpc actually rolled the week, so
   * it is as idempotent as the rollover. A failure is logged and never fails or undoes the
   * rollover (same stance as the sync's posts).
   */
  async function postWeek(
    seasonId: string,
    weekStart: string,
    results: MatchupsWeekResult[],
    pairings: { home: { name: string; slug: string }; away: { name: string; slug: string } }[],
    log: Logger,
  ): Promise<RolloverPostStatus> {
    try {
      const post = buildMatchupsWeekPost({ weekStart, results, pairings });
      if (!post) return "none";
      await deps.posts.write(seasonId, post);
      return "written";
    } catch (error) {
      log.error("matchups week post failed", { error });
      return "failed";
    }
  }

  return {
    /**
     * The Monday rollover: close last week's matchups at the current season totals and open this
     * week's pairings, in one database transaction. Called by a daily cron (twice, to cover both
     * halves of the daylight-saving year), so repeats are the normal case and every one after the
     * first is a no-op. Safe to run late: a Monday the job missed is caught up the next day.
     *
     * The totals are read once, from fresh data, and used for both the closing totals of the old
     * week and the starting totals of the new one, so no point is lost or counted twice.
     *
     * Expected failures from the database function come back as a typed error. Anything
     * unexpected (database down, a reply that does not match) throws for the route to log.
     */
    async rollWeek(input: { now: Date }): Promise<Result<RolloverReport, MatchupError>> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId });
      const { now } = input;
      const window = rolloverWindow(now);
      const { weekStart } = window;
      const skipped = (reason: RolloverSkipReason): Result<RolloverReport, MatchupError> => {
        log.info("matchups rollover skipped", { reason, weekStart });
        return { ok: true, value: { status: "skipped", reason, correlationId, weekStart } };
      };

      if (!window.due) return skipped("not_due");

      const data = await deps.league.loadFresh();
      if (!data) return skipped("no_season");
      const seasonId = data.season.id;

      const action = rolloverAction(weekStart, {
        firstDay: data.season.startsOn,
        lastDay: data.season.endsOn,
      });
      if (action === "skip") return skipped("outside_season");

      const existing = await deps.matchups.listSeason(seasonId);
      if (action === "pair" && waitsForMonday(now, existing.length > 0)) {
        return skipped("waiting_for_monday");
      }
      // What the rpc will close: every open matchup of an earlier week.
      const open = existing.filter((m) => matchupStatus(m) === "live" && m.weekStart < weekStart);
      if (action === "close_only" && open.length === 0) return skipped("nothing_open");

      // One scored league, one set of totals: the same domain functions the pages use, so the
      // numbers a matchup freezes are the numbers the Standings page showed.
      const { standings } = buildLeagueModel(data, easternDate(now));
      const totals = new Map(standings.map((row) => [row.teamId, row.total]));
      const teams = new Map(standings.map((row) => [row.teamId, row]));
      const pointsOf = (teamId: string): number => totals.get(teamId) ?? 0;

      let pairing: ReturnType<typeof pairByStandings> = { pairs: [], bye: null };
      if (action === "pair") {
        const recent = await deps.matchups.listRecentPairs(seasonId, weekStart, REMATCH_WEEKS);
        pairing = pairByStandings(standings, recent);
      }

      const rolled = await deps.matchups.rollWeek({
        seasonId,
        weekStart,
        finals: standings.map((row) => ({ teamId: row.teamId, points: row.total })),
        pairings: pairing.pairs.map((p) => ({
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          homeStartPoints: pointsOf(p.homeTeamId),
          awayStartPoints: pointsOf(p.awayTeamId),
        })),
      });
      if (!rolled.ok) {
        log.warn("matchups rollover refused", { code: rolled.error.code, weekStart });
        return rolled;
      }

      // Rolled or not. An earlier run may have committed and then died before it dropped the
      // cache; this run is the one that repairs the stale pages.
      deps.revalidate();

      if (!rolled.value.rolled) return skipped("already_rolled");

      const { finalized, created } = rolled.value;
      if (pairing.bye) log.info("matchups bye this week", { teamId: pairing.bye });

      const post = await postWeek(
        seasonId,
        weekStart,
        closedResults(open, totals, teams),
        pairing.pairs.flatMap((p) => {
          const home = teams.get(p.homeTeamId);
          const away = teams.get(p.awayTeamId);
          return home && away
            ? [
                {
                  home: { name: home.teamName, slug: home.slug },
                  away: { name: away.teamName, slug: away.slug },
                },
              ]
            : [];
        }),
        log,
      );

      log.info("matchups rollover finished", {
        weekStart,
        action,
        finalized,
        created,
        bye: pairing.bye !== null,
        post,
      });
      return {
        ok: true,
        value: {
          status: "done",
          correlationId,
          weekStart,
          action,
          finalized,
          created,
          byeTeamId: pairing.bye,
          post,
        },
      };
    },
  };
}
