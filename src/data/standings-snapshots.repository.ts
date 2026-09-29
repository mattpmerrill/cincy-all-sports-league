import type { DbClient } from "./db-client";

export type SnapshotWrite = { teamId: string; rank: number; totalPoints: number };

export type SnapshotDay = { date: string; rows: SnapshotWrite[] };

export type StandingsSnapshotsRepository = ReturnType<typeof createStandingsSnapshotsRepository>;

export function createStandingsSnapshotsRepository(db: DbClient) {
  return {
    /** Ranks from the most recent day strictly before `date`; empty when there is no history yet. */
    async latestBefore(
      seasonId: string,
      date: string,
    ): Promise<{ teamId: string; rank: number }[]> {
      const { data: latest, error: latestError } = await db
        .from("standings_snapshots")
        .select("snapshot_date")
        .eq("season_id", seasonId)
        .lt("snapshot_date", date)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest) return [];
      const { data, error } = await db
        .from("standings_snapshots")
        .select("fantasy_team_id, rank")
        .eq("season_id", seasonId)
        .eq("snapshot_date", latest.snapshot_date);
      if (error) throw error;
      return data.map((r) => ({ teamId: r.fantasy_team_id, rank: r.rank }));
    },

    /** One row per team per day: re-running on the same day replaces that day's values. */
    async upsertDay(seasonId: string, date: string, rows: readonly SnapshotWrite[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from("standings_snapshots").upsert(
        rows.map((r) => ({
          season_id: seasonId,
          fantasy_team_id: r.teamId,
          snapshot_date: date,
          rank: r.rank,
          total_points: r.totalPoints,
        })),
        { onConflict: "season_id,fantasy_team_id,snapshot_date" },
      );
      if (error) throw error;
    },

    /**
     * The newest day at or before `date` and every team's row for it, or null when there is none.
     * "On or before" because sync only writes a snapshot on days something changed.
     */
    async latestOnOrBefore(seasonId: string, date: string): Promise<SnapshotDay | null> {
      const { data: latest, error: dayError } = await db
        .from("standings_snapshots")
        .select("snapshot_date")
        .eq("season_id", seasonId)
        .lte("snapshot_date", date)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dayError) throw dayError;
      if (!latest) return null;

      const { data, error } = await db
        .from("standings_snapshots")
        .select("fantasy_team_id, rank, total_points")
        .eq("season_id", seasonId)
        .eq("snapshot_date", latest.snapshot_date);
      if (error) throw error;
      return {
        date: latest.snapshot_date,
        rows: data.map((r) => ({
          teamId: r.fantasy_team_id,
          rank: r.rank,
          totalPoints: r.total_points,
        })),
      };
    },
  };
}
