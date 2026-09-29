import type { DbClient } from "./db-client";

/** The minimum the claim flow needs to name a team. The league read services extend this file. */
export type TeamRef = { id: string; name: string; slug: string };

export type FantasyTeamsRepository = ReturnType<typeof createFantasyTeamsRepository>;

export function createFantasyTeamsRepository(db: DbClient) {
  return {
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
