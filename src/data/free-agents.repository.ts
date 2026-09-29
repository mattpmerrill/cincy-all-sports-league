import type { PostgrestError } from "@supabase/supabase-js";
import { isFreeAgentErrorCode } from "@/domain/free-agents";
import type {
  FreeAgentError,
  FreeAgentErrorCode,
  FreeAgentMove,
  FreeAgentPost,
} from "@/domain/free-agents";
import type { ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import { ok, type Result } from "@/lib/result";
import { PG, type DbClient } from "./db-client";
import { PARTICIPANT_COLUMNS, toOwner, toParticipant, toSportCode } from "./mappers";
import type { OwnerRow, ParticipantRow } from "./mappers";
import { fetchAllRows } from "./paginate";
import type { TradeLiveScore } from "./trades.repository";

/**
 * Free agents: reads, and a thin wrapper over `make_free_agent_move` (ADR-004).
 *
 * Which client to pass: the tables are publicly readable, so reads work with the session or public
 * client. The function can only be executed by `service_role`, so `makeMove` must be given the
 * admin (secret-key) client, and the caller (a Server Action, through the free-agents service)
 * must already have authenticated the user and pass the id as `actorId`. Passing a session client
 * to it fails with a permission error, which is thrown, never mapped.
 */

// ===== row shapes and mappers =====

type TeamEmbed = { id: string; slug: string; name: string; profiles: OwnerRow | null };

export type MoveRow = {
  id: string;
  created_at: string;
  sports: { code: string };
  fantasy_teams: TeamEmbed;
  dropped: ParticipantRow;
  added: ParticipantRow;
};

// A move points at `participants` twice and, through its composite keys, at teams and sports in
// more than one way. Each embed names its foreign key, and the two participant embeds get aliases
// so the row says which is which.
const MOVE_SELECT = `id, created_at,
  sports!free_agent_moves_sport_id_fkey!inner(code),
  fantasy_teams!free_agent_moves_team_fkey(id, slug, name, profiles(id, display_name, avatar_url)),
  dropped:participants!free_agent_moves_dropped_fkey(${PARTICIPANT_COLUMNS}),
  added:participants!free_agent_moves_added_fkey(${PARTICIPANT_COLUMNS})`;

/** Row to domain. An unknown sport code means the DB and the sport catalog have drifted: fail loudly. */
export const toFreeAgentMove = (row: MoveRow): FreeAgentMove => ({
  id: row.id,
  team: {
    id: row.fantasy_teams.id,
    name: row.fantasy_teams.name,
    slug: row.fantasy_teams.slug,
    owner: toOwner(row.fantasy_teams.profiles),
  },
  sport: toSportCode(row.sports.code),
  dropped: toParticipant(row.dropped),
  added: toParticipant(row.added),
  createdAt: row.created_at,
});

// ===== error mapping =====

/**
 * What a person sees for each code. Never the SQL token, message or detail: those stay in logs.
 * `sport_locked` and `facts_unavailable` are never raised by SQL (the service decides them) and
 * `busy` comes from SQLSTATEs, not tokens, but the record covers the whole union so a new code
 * cannot ship without a message.
 */
const MESSAGES: Record<FreeAgentErrorCode, string> = {
  not_owner: "You need an approved team in this league to make moves.",
  invalid_sport: "That sport isn't part of this season.",
  not_found: "That player isn't in this sport.",
  stale_pick: "Your pick in this sport changed since you opened the page. Refresh and try again.",
  same_participant: "That's already your pick.",
  not_free_agent: "Another team just picked them up. Choose another free agent.",
  missing_scores: "Something went wrong working out the points. Try again.",
  sport_locked: "That sport's season is over, so moves are closed.",
  busy: "Someone else was making a move at the same moment. Try again.",
  facts_unavailable:
    "We couldn't get the latest scores from ESPN, so nothing changed. Try again in a minute.",
};

/**
 * A `P0001` raised by the function carries a stable token as its message. A deadlock or
 * serialization failure means Postgres rolled the whole call back, so it maps to `busy` and the
 * person can simply retry. Anything else (permissions, constraints, network) returns null and the
 * caller rethrows it.
 */
export function toFreeAgentError(
  error: Pick<PostgrestError, "code" | "message">,
): FreeAgentError | null {
  if (error.code === PG.deadlockDetected || error.code === PG.serializationFailure) {
    return { code: "busy", message: MESSAGES.busy };
  }
  if (error.code !== PG.raiseException || !isFreeAgentErrorCode(error.message)) return null;
  return { code: error.message, message: MESSAGES[error.message] };
}

// ===== repository =====

export type FreeAgentsRepository = ReturnType<typeof createFreeAgentsRepository>;

export function createFreeAgentsRepository(db: DbClient) {
  return {
    // ----- reads (public read; any client) -----

    /**
     * Every participant in a sport, drafted or not, by name. The caller subtracts what teams hold
     * (the pool is the same for everyone; who holds what changes with every move). Paged, because
     * the largest sport has a few hundred rows and PostgREST stops at 1000.
     */
    async listPool(sport: SportCode): Promise<ParticipantData[]> {
      const rows = await fetchAllRows<ParticipantRow>((from, to) =>
        db
          .from("participants")
          .select(`${PARTICIPANT_COLUMNS}, sports!inner(code)`)
          .eq("sports.code", sport)
          // Name alone is not unique (ESPN has duplicate display names), and paging needs a
          // total order or a row can land on two pages or none.
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      return rows.map(toParticipant);
    },

    /** A participant with its sport, or null when the id matches nothing. */
    async getParticipant(
      id: string,
    ): Promise<{ sport: SportCode; participant: ParticipantData } | null> {
      const { data, error } = await db
        .from("participants")
        .select(`${PARTICIPANT_COLUMNS}, sports(code)`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { sport: toSportCode(data.sports.code), participant: toParticipant(data) }
        : null;
    },

    /** Moves in the active season, newest first, optionally for one sport. */
    async listRecentMoves(opts: { limit: number; sport?: SportCode }): Promise<FreeAgentMove[]> {
      const { data: season, error: seasonError } = await db
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();
      if (seasonError) throw seasonError;
      if (!season) return [];

      let query = db.from("free_agent_moves").select(MOVE_SELECT).eq("season_id", season.id);
      if (opts.sport) query = query.eq("sports.code", opts.sport);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(opts.limit)
        .returns<MoveRow[]>();
      if (error) throw error;
      return data.map(toFreeAgentMove);
    },

    // ----- mutation (admin client only; see the file header) -----

    /**
     * Drops the actor's pick in `sport` and adds `addId`. `scores` must hold the live score of
     * both participants; the function refuses (`missing_scores`) rather than guess a zero. The
     * function derives what is dropped from the current pick, so `dropId` is only a staleness check.
     */
    async makeMove(input: {
      actorId: string;
      sport: SportCode;
      dropId: string;
      addId: string;
      scores: readonly TradeLiveScore[];
      post: FreeAgentPost;
    }): Promise<Result<{ moveId: string }, FreeAgentError>> {
      const { data, error } = await db.rpc("make_free_agent_move", {
        p_actor: input.actorId,
        p_sport_code: input.sport,
        p_drop_participant_id: input.dropId,
        p_add_participant_id: input.addId,
        p_scores: input.scores.map((s) => ({
          participant_id: s.participantId,
          points: s.points,
          championships: s.championships,
          postseason_points: s.postseasonPoints,
        })),
        p_post_body: input.post.body,
        p_post_payload: input.post.payload,
      });
      if (error) {
        const mapped = toFreeAgentError(error);
        if (!mapped) throw error;
        return { ok: false, error: mapped };
      }
      return ok({ moveId: data });
    },
  };
}
