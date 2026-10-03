import type { Game, GameStatus } from "@/domain/schedule";
import type { SportCode } from "@/domain/sports/sports";
import type { DbClient } from "./db-client";
import type { Tables, TablesInsert } from "./database.types";
import { toSportCode } from "./mappers";
import { fetchAllRows } from "./paginate";

/** A game's end as the refresh hands it over: the vendor's ids, not ours. */
export type GameSideWrite = {
  externalId: string;
  name: string;
  shortName: string;
  score: number | null;
  winner: boolean | null;
};

/** A game as the games refresh writes it. Vendor-neutral: the data layer never sees ESPN types. */
export type GameWrite = {
  externalId: string;
  startsAt: Date;
  timeTbd: boolean;
  status: GameStatus;
  statusDetail: string | null;
  note: string | null;
  neutralSite: boolean;
  home: GameSideWrite;
  away: GameSideWrite;
};

export type UpsertGamesSummary = {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Sides whose team has no participant row yet, kept by name and filled in on a later run. */
  unmappedSides: number;
};

type GameRow = Tables<"games">;

/** Ids per lookup: keeps the `in (...)` list, and so the request URL, short. */
const LOOKUP_CHUNK = 100;
const UPSERT_CHUNK = 200;

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

// ===== write side =====
// `status: game.status` below (domain into column) and `status: row.status` in `toGame` (column
// into domain) each compile only while the DB enum and GAME_STATUSES list the same states.

type GameInsert = TablesInsert<"games">;

const toInsert = (
  seasonId: string,
  sportId: string,
  game: GameWrite,
  participantByExternalId: ReadonlyMap<string, string>,
): GameInsert => ({
  season_id: seasonId,
  sport_id: sportId,
  external_id: game.externalId,
  starts_at: game.startsAt.toISOString(),
  time_tbd: game.timeTbd,
  status: game.status,
  status_detail: game.statusDetail,
  note: game.note,
  neutral_site: game.neutralSite,
  home_external_id: game.home.externalId,
  home_participant_id: participantByExternalId.get(game.home.externalId) ?? null,
  home_name: game.home.name,
  home_short_name: game.home.shortName,
  home_score: game.home.score,
  home_winner: game.home.winner,
  away_external_id: game.away.externalId,
  away_participant_id: participantByExternalId.get(game.away.externalId) ?? null,
  away_name: game.away.name,
  away_short_name: game.away.shortName,
  away_score: game.away.score,
  away_winner: game.away.winner,
});

/**
 * Whether a refresh would change a stored game. Compares every column the refresh writes, with
 * the start as an instant (Postgres hands back "+00:00", the feed gives "Z"). Comparing first
 * means a quiet 30-minute run writes nothing, keeps `updated_at` honest, and lets the caller
 * skip dropping the page cache.
 */
export function gameChanged(existing: GameRow, next: GameInsert): boolean {
  return (
    new Date(existing.starts_at).getTime() !== new Date(next.starts_at).getTime() ||
    existing.time_tbd !== next.time_tbd ||
    existing.status !== next.status ||
    existing.status_detail !== next.status_detail ||
    existing.note !== next.note ||
    existing.neutral_site !== next.neutral_site ||
    existing.home_external_id !== next.home_external_id ||
    existing.home_participant_id !== next.home_participant_id ||
    existing.home_name !== next.home_name ||
    existing.home_short_name !== next.home_short_name ||
    existing.home_score !== next.home_score ||
    existing.home_winner !== next.home_winner ||
    existing.away_external_id !== next.away_external_id ||
    existing.away_participant_id !== next.away_participant_id ||
    existing.away_name !== next.away_name ||
    existing.away_short_name !== next.away_short_name ||
    existing.away_score !== next.away_score ||
    existing.away_winner !== next.away_winner
  );
}

// ===== read side =====

type LogoEmbed = { logo_url: string | null } | null;
export type GameReadRow = GameRow & { home: LogoEmbed; away: LogoEmbed };

// Two embeds of the same table: each names its foreign key and gets an alias, as the free-agent
// moves do. The logo comes from the participant row, so a game costs no extra stored columns.
const GAME_SELECT = `*,
  home:participants!games_home_participant_fkey(logo_url),
  away:participants!games_away_participant_fkey(logo_url)`;

/** Row to domain. An unknown sport code means the DB and the sport catalog have drifted. */
export function toGame(row: GameReadRow, sport: SportCode): Game {
  return {
    id: row.id,
    sport,
    externalId: row.external_id,
    startsAt: new Date(row.starts_at).toISOString(),
    timeTbd: row.time_tbd,
    status: row.status,
    statusDetail: row.status_detail,
    note: row.note,
    neutralSite: row.neutral_site,
    home: {
      externalId: row.home_external_id,
      participantId: row.home_participant_id,
      name: row.home_name,
      shortName: row.home_short_name,
      logoUrl: row.home?.logo_url ?? null,
      score: row.home_score,
      winner: row.home_winner,
    },
    away: {
      externalId: row.away_external_id,
      participantId: row.away_participant_id,
      name: row.away_name,
      shortName: row.away_short_name,
      logoUrl: row.away?.logo_url ?? null,
      score: row.away_score,
      winner: row.away_winner,
    },
  };
}

export type GamesRepository = ReturnType<typeof createGamesRepository>;

/**
 * Games are publicly readable, so `listBetween` works with any client. `upsertGames` needs the
 * admin (secret-key) client: there is no write policy for anyone else.
 */
export function createGamesRepository(db: DbClient) {
  /** Our participant id for each vendor team id of a sport, for the ids asked about. */
  async function participantIds(
    sportId: string,
    externalIds: readonly string[],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const ids of chunks(externalIds, LOOKUP_CHUNK)) {
      const { data, error } = await db
        .from("participants")
        .select("id, espn_id")
        .eq("sport_id", sportId)
        .in("espn_id", ids);
      if (error) throw error;
      for (const row of data) if (row.espn_id !== null) found.set(row.espn_id, row.id);
    }
    return found;
  }

  async function storedGames(
    sportId: string,
    externalIds: readonly string[],
  ): Promise<Map<string, GameRow>> {
    const found = new Map<string, GameRow>();
    for (const ids of chunks(externalIds, LOOKUP_CHUNK)) {
      const { data, error } = await db
        .from("games")
        .select("*")
        .eq("sport_id", sportId)
        .in("external_id", ids);
      if (error) throw error;
      for (const row of data) found.set(row.external_id, row);
    }
    return found;
  }

  return {
    /**
     * Idempotent: games are keyed by (sport, vendor event id), each side's vendor team id is
     * mapped to this sport's participant, and only new or changed games are written, so running a
     * refresh twice (or two overlapping) writes the second time nothing, or the same rows again.
     * Throws on a database error; the caller isolates failures per sport.
     */
    async upsertGames(
      target: { seasonId: string; sportId: string },
      games: readonly GameWrite[],
    ): Promise<UpsertGamesSummary> {
      const summary: UpsertGamesSummary = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        unmappedSides: 0,
      };
      if (games.length === 0) return summary;

      // The same event twice in one batch would make the upsert touch a row twice; last one wins.
      const unique = [...new Map(games.map((g) => [g.externalId, g])).values()];

      const teamIds = [...new Set(unique.flatMap((g) => [g.home.externalId, g.away.externalId]))];
      const [participantByTeam, stored] = await Promise.all([
        participantIds(target.sportId, teamIds),
        storedGames(
          target.sportId,
          unique.map((g) => g.externalId),
        ),
      ]);

      const toWrite: GameInsert[] = [];
      for (const game of unique) {
        const row = toInsert(target.seasonId, target.sportId, game, participantByTeam);
        if (row.home_participant_id === null) summary.unmappedSides += 1;
        if (row.away_participant_id === null) summary.unmappedSides += 1;

        const existing = stored.get(game.externalId);
        if (!existing) summary.inserted += 1;
        else if (gameChanged(existing, row)) summary.updated += 1;
        else {
          summary.unchanged += 1;
          continue;
        }
        toWrite.push(row);
      }

      for (const batch of chunks(toWrite, UPSERT_CHUNK)) {
        const { error } = await db
          .from("games")
          .upsert(batch, { onConflict: "sport_id,external_id" });
        if (error) throw error;
      }
      return summary;
    },

    /**
     * A season's games that start in `[from, to)`, in start order. Pro leagues store every game,
     * so a busy week is a few hundred rows; the pager keeps even a pile-up under PostgREST's cap.
     */
    async listBetween(seasonId: string, from: Date, to: Date): Promise<Game[]> {
      const [rows, sports] = await Promise.all([
        fetchAllRows<GameReadRow>((first, last) =>
          db
            .from("games")
            .select(GAME_SELECT)
            .eq("season_id", seasonId)
            .gte("starts_at", from.toISOString())
            .lt("starts_at", to.toISOString())
            .order("starts_at")
            .order("id")
            .range(first, last),
        ),
        db.from("sports").select("id, code"),
      ]);
      if (sports.error) throw sports.error;
      const codeById = new Map(sports.data.map((s) => [s.id, toSportCode(s.code)]));
      return rows.map((row) => {
        const sport = codeById.get(row.sport_id);
        if (!sport) throw new Error(`Game ${row.id} points at an unknown sport`);
        return toGame(row, sport);
      });
    },
  };
}
