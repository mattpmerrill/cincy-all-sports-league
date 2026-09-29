import type { DbClient } from "./db-client";
import { fetchAllRows } from "./paginate";

/** Just what the roster load needs to tell "already stored" from "new". */
export type StoredParticipant = { id: string; name: string; espnId: string | null };

export type NewParticipant = {
  sportId: string;
  espnId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

const INSERT_CHUNK = 500;

type Row = { id: string; name: string; espn_id: string | null };

export type ParticipantsRepository = ReturnType<typeof createParticipantsRepository>;

/** Writes need the admin (secret-key) client: `participants` has no write policy for members. */
export function createParticipantsRepository(db: DbClient) {
  return {
    /** Every participant of a sport, held or not. */
    async listForSport(sportId: string): Promise<StoredParticipant[]> {
      const rows = await fetchAllRows<Row>((from, to) =>
        db
          .from("participants")
          .select("id, name, espn_id")
          .eq("sport_id", sportId)
          .order("id")
          .range(from, to),
      );
      return rows.map((r) => ({ id: r.id, name: r.name, espnId: r.espn_id }));
    },

    /**
     * Inserts in chunks and returns how many rows were actually created. A row whose (sport, ESPN
     * id) already exists is ignored rather than failing, so two overlapping loads of the same
     * sport cannot collide: the slower one inserts fewer rows and both finish cleanly.
     */
    async insertMany(rows: readonly NewParticipant[]): Promise<number> {
      let inserted = 0;
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({
          sport_id: r.sportId,
          espn_id: r.espnId,
          name: r.name,
          short_name: r.shortName,
          logo_url: r.logoUrl,
          primary_color: r.primaryColor,
        }));
        const { data, error } = await db
          .from("participants")
          .upsert(chunk, { onConflict: "sport_id,espn_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inserted += data.length;
      }
      return inserted;
    },
  };
}
