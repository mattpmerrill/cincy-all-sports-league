import type { OwnerData, ParticipantData, TeamData } from "@/domain/league";
import { isSportCode } from "@/domain/sports/sports";
import type { DbClient } from "./db-client";

/** The minimum the claim flow needs to name a team. The league read services extend this file. */
export type TeamRef = { id: string; name: string; slug: string };

type PickRow = {
  sports: { code: string };
  participants: {
    id: string;
    name: string;
    short_name: string;
    logo_url: string | null;
    primary_color: string | null;
  };
};

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  profiles: { id: string; display_name: string; avatar_url: string | null } | null;
  picks: PickRow[];
};

const toOwner = (profile: TeamRow["profiles"]): OwnerData | null =>
  profile
    ? { id: profile.id, displayName: profile.display_name, avatarUrl: profile.avatar_url }
    : null;

const toParticipant = (row: PickRow["participants"]): ParticipantData => ({
  id: row.id,
  name: row.name,
  shortName: row.short_name,
  logoUrl: row.logo_url,
  primaryColor: row.primary_color,
});

/** Row to domain. An unknown sport code means the DB and the sport catalog have drifted: fail loudly. */
export function toTeamData(row: TeamRow): TeamData {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    owner: toOwner(row.profiles),
    picks: row.picks.map((pick) => {
      if (!isSportCode(pick.sports.code))
        throw new Error(`Unknown sport code "${pick.sports.code}"`);
      return { sport: pick.sports.code, participant: toParticipant(pick.participants) };
    }),
  };
}

export type FantasyTeamsRepository = ReturnType<typeof createFantasyTeamsRepository>;

export function createFantasyTeamsRepository(db: DbClient) {
  return {
    /** Every team in a season with its owner and picks (participants included), by name. */
    async listWithPicks(seasonId: string): Promise<TeamData[]> {
      const { data, error } = await db
        .from("fantasy_teams")
        .select(
          "id, slug, name, profiles(id, display_name, avatar_url), picks(sports(code), participants(id, name, short_name, logo_url, primary_color))",
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
