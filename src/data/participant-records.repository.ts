import type { RecordData } from "@/domain/league";
import type { DbClient } from "./db-client";
import type { Tables } from "./database.types";
import { fetchAllRows } from "./paginate";

type RecordRow = Pick<
  Tables<"participant_records">,
  "participant_id" | "wins" | "losses" | "ties" | "ot_losses"
>;

const COLUMNS = "participant_id, wins, losses, ties, ot_losses";
const WRITE_CHUNK = 500;
/** Same ceiling as the results repository: a long `.in()` list overflows the request URL. */
const ID_FILTER_CHUNK = 150;

export const toRecordData = (row: RecordRow): RecordData => ({
  participantId: row.participant_id,
  wins: row.wins,
  losses: row.losses,
  ties: row.ties,
  otLosses: row.ot_losses,
});

export type ParticipantRecordsRepository = ReturnType<typeof createParticipantRecordsRepository>;

/**
 * Regular-season records: display facts kept beside, never inside, the scoring facts in
 * `participant_results`. Public read, so reads work with any client; `upsertMany` is sync's writer
 * and needs the secret-key client (no other role can write the table).
 */
export function createParticipantRecordsRepository(db: DbClient) {
  return {
    /** Every record in a season, free agents included (the league read model carries them all). */
    async listForSeason(seasonId: string): Promise<RecordData[]> {
      const rows = await fetchAllRows<RecordRow>((from, to) =>
        db
          .from("participant_records")
          .select(COLUMNS)
          .eq("season_id", seasonId)
          // The primary key is (season, participant), so participant_id is a total order here.
          .order("participant_id")
          .range(from, to),
      );
      return rows.map(toRecordData);
    },

    /** What is stored for these participants, so sync can write only what changed. */
    async listForParticipants(
      seasonId: string,
      participantIds: readonly string[],
    ): Promise<RecordData[]> {
      const chunks: string[][] = [];
      for (let i = 0; i < participantIds.length; i += ID_FILTER_CHUNK) {
        chunks.push(participantIds.slice(i, i + ID_FILTER_CHUNK));
      }
      const perChunk = await Promise.all(
        chunks.map((ids) =>
          fetchAllRows<RecordRow>((from, to) =>
            db
              .from("participant_records")
              .select(COLUMNS)
              .eq("season_id", seasonId)
              .in("participant_id", ids)
              .order("participant_id")
              .range(from, to),
          ),
        ),
      );
      return perChunk.flat().map(toRecordData);
    },

    /** Idempotent: the same record twice leaves one row (upsert on the primary key). */
    async upsertMany(seasonId: string, records: readonly RecordData[]): Promise<number> {
      for (let i = 0; i < records.length; i += WRITE_CHUNK) {
        const chunk = records.slice(i, i + WRITE_CHUNK).map((r) => ({
          season_id: seasonId,
          participant_id: r.participantId,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          ot_losses: r.otLosses,
        }));
        const { error } = await db
          .from("participant_records")
          .upsert(chunk, { onConflict: "season_id,participant_id" });
        if (error) throw error;
      }
      return records.length;
    },
  };
}
