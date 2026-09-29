import type { Json } from "./database.types";
import type { DbClient } from "./db-client";

export type SyncStatus = "running" | "succeeded" | "failed" | "skipped";

export type SyncRunRow = {
  id: string;
  sportId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  summary: Json;
};

const COLUMNS = "id, sport_id, started_at, finished_at, status, summary";

type Row = {
  id: string;
  sport_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: SyncStatus;
  summary: Json;
};

const toRun = (r: Row): SyncRunRow => ({
  id: r.id,
  sportId: r.sport_id,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  status: r.status,
  summary: r.summary,
});

export type SyncRunsRepository = ReturnType<typeof createSyncRunsRepository>;

export function createSyncRunsRepository(db: DbClient) {
  return {
    async start(sportId: string, now: Date): Promise<string> {
      const { data, error } = await db
        .from("sync_runs")
        .insert({ sport_id: sportId, started_at: now.toISOString(), status: "running" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async finish(
      id: string,
      status: Exclude<SyncStatus, "running">,
      summary: Json,
      now: Date,
    ): Promise<void> {
      const { error } = await db
        .from("sync_runs")
        .update({ status, summary, finished_at: now.toISOString() })
        .eq("id", id);
      if (error) throw error;
    },

    /** A skipped run has no start-to-finish work; it is written already finished. */
    async recordSkipped(sportId: string, summary: Json, now: Date): Promise<void> {
      const at = now.toISOString();
      const { error } = await db
        .from("sync_runs")
        .insert({ sport_id: sportId, started_at: at, finished_at: at, status: "skipped", summary });
      if (error) throw error;
    },

    /** A function killed at its time limit leaves a run stuck in "running"; close those out. */
    async failStale(startedBefore: Date, now: Date): Promise<number> {
      const { data, error } = await db
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: now.toISOString(),
          summary: { error: { code: "timeout", message: "The run never finished." } },
        })
        .eq("status", "running")
        .lt("started_at", startedBefore.toISOString())
        .select("id");
      if (error) throw error;
      return data.length;
    },

    /** The newest run for each of the given sports (one small query each; there are 11). */
    async latestForSports(sportIds: readonly string[]): Promise<Map<string, SyncRunRow>> {
      const found = await Promise.all(
        sportIds.map(async (sportId) => {
          const { data, error } = await db
            .from("sync_runs")
            .select(COLUMNS)
            .eq("sport_id", sportId)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data ? toRun(data) : null;
        }),
      );
      const bySport = new Map<string, SyncRunRow>();
      for (const run of found) if (run?.sportId) bySport.set(run.sportId, run);
      return bySport;
    },
  };
}
