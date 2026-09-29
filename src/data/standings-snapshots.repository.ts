import type { DbClient } from "./db-client";

export type SnapshotWrite = { teamId: string; rank: number; totalPoints: number };

export type StandingsSnapshotsRepository = ReturnType<typeof createStandingsSnapshotsRepository>;

export function createStandingsSnapshotsRepository(db: DbClient) {
  return {
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
  };
}
