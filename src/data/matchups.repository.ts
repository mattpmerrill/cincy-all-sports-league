import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { stepWeek } from "@/domain/calendar/week";
import { MATCHUP_MESSAGES, isMatchupErrorCode } from "@/domain/matchups";
import type { Matchup, MatchupError, RecentPair } from "@/domain/matchups";
import { fromUnits, toUnits } from "@/domain/scoring";
import { ok, type Result } from "@/lib/result";
import { PG, type DbClient } from "./db-client";
import type { Tables } from "./database.types";
import { fetchAllRows } from "./paginate";

/**
 * Weekly matchups: reads, and a thin wrapper over `roll_matchup_week` (see the migration header
 * for its contract).
 *
 * Which client to pass: matchups are publicly readable, so the reads work with the session or
 * public client. The function can only be executed by `service_role`, so `rollWeek` must be given
 * the admin (secret-key) client. Passing a session client to it fails with a permission error,
 * which is thrown, never mapped.
 */

// ===== row to domain =====

export type MatchupRow = Tables<"matchups">;

/**
 * Row to domain. The table keeps both end totals set or both null, so a half-finished row means
 * the database and this mapper disagree: fail loudly rather than show a made-up result.
 */
export function toMatchup(row: MatchupRow): Matchup {
  if ((row.home_end_points === null) !== (row.away_end_points === null)) {
    throw new Error(`Matchup ${row.id} has an end total for only one side`);
  }
  return {
    id: row.id,
    seasonId: row.season_id,
    weekStart: row.week_start,
    home: {
      teamId: row.home_team_id,
      startPoints: row.home_start_points,
      endPoints: row.home_end_points,
    },
    away: {
      teamId: row.away_team_id,
      startPoints: row.away_start_points,
      endPoints: row.away_end_points,
    },
    finalizedAt: row.finalized_at === null ? null : new Date(row.finalized_at).toISOString(),
  };
}

// ===== roll_matchup_week =====

/** One team's closing season total: written as end points on every still-open row of an earlier week. */
export type MatchupFinal = { teamId: string; points: number };

/** One new matchup of the week, with both teams' season totals frozen as its start points. */
export type MatchupPairingWrite = {
  homeTeamId: string;
  awayTeamId: string;
  homeStartPoints: number;
  awayStartPoints: number;
};

export type RollWeekInput = {
  seasonId: string;
  /** ISO date of a Monday. */
  weekStart: string;
  finals: readonly MatchupFinal[];
  /** Empty means "close only": finalize the open rows and open nothing. */
  pairings: readonly MatchupPairingWrite[];
};

/** `rolled` is false when the call changed nothing (the week already had rows, or nothing was open). */
const rollSummarySchema = z.object({
  rolled: z.boolean(),
  finalized: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
});
export type RollWeekSummary = z.infer<typeof rollSummarySchema>;

/**
 * A `P0001` raised by the function carries a stable token as its message. Anything else
 * (permissions, a team of another season failing its foreign key, network) returns null and the
 * caller rethrows it: the service builds these arguments itself, so those are bugs or outages,
 * not something to show a person.
 */
export function toMatchupError(
  error: Pick<PostgrestError, "code" | "message">,
): MatchupError | null {
  if (error.code !== PG.raiseException || !isMatchupErrorCode(error.message)) return null;
  return { code: error.message, message: MATCHUP_MESSAGES[error.message] };
}

/** The columns are numeric(9, 4): send what will be stored, so the app owns the rounding. */
const storedPoints = (points: number): number => fromUnits(toUnits(points));

// ===== repository =====

export type MatchupsRepository = ReturnType<typeof createMatchupsRepository>;

export function createMatchupsRepository(db: DbClient) {
  return {
    // ----- reads (public read; any client) -----

    /** Every matchup of a season, oldest week first. Paged: a season of 10 a week stays far under the cap, but a cap is a silent truncation. */
    async listSeason(seasonId: string): Promise<Matchup[]> {
      const rows = await fetchAllRows<MatchupRow>((from, to) =>
        db
          .from("matchups")
          .select("*")
          .eq("season_id", seasonId)
          .order("week_start", { ascending: true })
          // Paging needs a total order, and a week holds many rows.
          .order("id", { ascending: true })
          .range(from, to),
      );
      return rows.map(toMatchup);
    },

    /**
     * Who met whom in the `weeks` weeks before `beforeWeekStart` (that week excluded), for the
     * rematch guard. Only team ids leave the layer. Weeks without matchups simply contribute
     * nothing, so the first weeks of a season, or a gap, need no special case.
     */
    async listRecentPairs(
      seasonId: string,
      beforeWeekStart: string,
      weeks: number,
    ): Promise<RecentPair[]> {
      const rows = await fetchAllRows<Pick<MatchupRow, "home_team_id" | "away_team_id">>(
        (from, to) =>
          db
            .from("matchups")
            .select("home_team_id, away_team_id")
            .eq("season_id", seasonId)
            .gte("week_start", stepWeek(beforeWeekStart, -weeks))
            .lt("week_start", beforeWeekStart)
            .order("week_start", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
      );
      return rows.map((row): RecentPair => [row.home_team_id, row.away_team_id]);
    },

    // ----- mutation (admin client only; see the file header) -----

    /**
     * Closes the open matchups of earlier weeks with `finals` and opens `weekStart` with
     * `pairings`, in one transaction. Safe to repeat: when the week already has rows nothing
     * changes and `rolled` is false. Returns the function's failure tokens as a typed error;
     * anything else throws. A reply that does not match the documented shape throws too, because
     * it means the function and this wrapper have drifted apart.
     */
    async rollWeek(input: RollWeekInput): Promise<Result<RollWeekSummary, MatchupError>> {
      const { data, error } = await db.rpc("roll_matchup_week", {
        p_season_id: input.seasonId,
        p_week_start: input.weekStart,
        p_finals: input.finals.map((f) => ({ team_id: f.teamId, points: storedPoints(f.points) })),
        p_pairings: input.pairings.map((p) => ({
          home_team_id: p.homeTeamId,
          away_team_id: p.awayTeamId,
          home_start_points: storedPoints(p.homeStartPoints),
          away_start_points: storedPoints(p.awayStartPoints),
        })),
      });
      if (error) {
        const mapped = toMatchupError(error);
        if (!mapped) throw error;
        return { ok: false, error: mapped };
      }
      return ok(rollSummarySchema.parse(data));
    },
  };
}
