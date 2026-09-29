import type { TeamData } from "@/domain/league";
import type { DbClient } from "./db-client";
import { PARTICIPANT_COLUMNS, toOwner, toParticipant, toSportCode } from "./mappers";
import type { OwnerRow, ParticipantRow } from "./mappers";

/** The minimum the claim flow needs to name a team. The league read services extend this file. */
export type TeamRef = { id: string; name: string; slug: string };

type PickRow = {
  sports: { code: string };
  participants: ParticipantRow;
  baseline_points: number;
  baseline_championships: number;
  baseline_postseason_points: number;
  acquired_at: string | null;
};

type BankedRow = {
  points: number;
  championships: number;
  postseason_points: number;
  participants: ParticipantRow & { sports: { code: string } };
};

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  profiles: OwnerRow | null;
  picks: PickRow[];
  banked_scores: BankedRow[];
};

/** Row to domain. An unknown sport code means the DB and the sport catalog have drifted: fail loudly. */
export function toTeamData(row: TeamRow): TeamData {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    owner: toOwner(row.profiles),
    picks: row.picks.map((pick) => ({
      sport: toSportCode(pick.sports.code),
      participant: toParticipant(pick.participants),
      baseline: {
        total: pick.baseline_points,
        championships: pick.baseline_championships,
        postseasonPoints: pick.baseline_postseason_points,
      },
      acquiredAt: pick.acquired_at,
    })),
    banked: row.banked_scores.map((b) => ({
      sport: toSportCode(b.participants.sports.code),
      participant: toParticipant(b.participants),
      total: b.points,
      championships: b.championships,
      postseasonPoints: b.postseason_points,
    })),
  };
}

export type FantasyTeamsRepository = ReturnType<typeof createFantasyTeamsRepository>;

export function createFantasyTeamsRepository(db: DbClient) {
  return {
    /**
     * Every team in a season with its owner, picks (participants and baselines included) and the
     * points it banked from participants it traded away, by name.
     */
    async listWithPicks(seasonId: string): Promise<TeamData[]> {
      const { data, error } = await db
        .from("fantasy_teams")
        .select(
          `id, slug, name, profiles(id, display_name, avatar_url),
            picks(sports(code), participants(${PARTICIPANT_COLUMNS}), baseline_points, baseline_championships, baseline_postseason_points, acquired_at),
            banked_scores(points, championships, postseason_points, participants(${PARTICIPANT_COLUMNS}, sports(code)))`,
        )
        .eq("season_id", seasonId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data.map((row) => toTeamData(row));
    },

    /** Teams in the active season that nobody owns yet: the only ones a member may claim. */
    async listUnclaimed(): Promise<TeamRef[]> {
      const { data, error } = await db
        .from("fantasy_teams")
        .select("id, name, slug, seasons!inner(is_active)")
        .is("owner_id", null)
        .eq("seasons.is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data.map(({ id, name, slug }) => ({ id, name, slug }));
    },

    async getOwnedBy(userId: string): Promise<TeamRef | null> {
      const { data, error } = await db
        .from("fantasy_teams")
        .select("id, name, slug, seasons!inner(is_active)")
        .eq("owner_id", userId)
        .eq("seasons.is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, name: data.name, slug: data.slug } : null;
    },

    /** Null owner and existence in one read, so the service can tell "taken" from "missing". */
    async getOwnership(teamId: string): Promise<{ team: TeamRef; ownerId: string | null } | null> {
      const { data, error } = await db
        .from("fantasy_teams")
        .select("id, name, slug, owner_id")
        .eq("id", teamId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { team: { id: data.id, name: data.name, slug: data.slug }, ownerId: data.owner_id }
        : null;
    },
  };
}
