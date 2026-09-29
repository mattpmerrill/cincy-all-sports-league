import type { UserRole } from "@/domain/membership/membership";
import type { DbClient } from "./db-client";
import type { Tables } from "./database.types";

/** A member as the app sees them. Deliberately has no email: profiles are publicly readable. */
export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
};

const COLUMNS = "id, display_name, avatar_url, role, created_at";
type ProfileRow = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "avatar_url" | "role" | "created_at"
>;

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  role: row.role,
  createdAt: row.created_at,
});

/** The only profile columns an opt-in read or write may name: the two email preferences. */
export const OPT_IN_COLUMNS = [
  "weekly_email_opt_in",
  "trade_emails",
] as const satisfies readonly (keyof Tables<"profiles">)[];
export type OptInColumn = (typeof OPT_IN_COLUMNS)[number];
type OptInRow = Record<OptInColumn, boolean>;

/** A computed key widens to a string index; this keeps the write typed to the two columns. */
function optInPatch(column: OptInColumn, optIn: boolean): Partial<OptInRow> {
  const patch: Partial<OptInRow> = {};
  patch[column] = optIn;
  return patch;
}

export type ProfilesRepository = ReturnType<typeof createProfilesRepository>;

export function createProfilesRepository(db: DbClient) {
  return {
    async getById(id: string): Promise<Profile | null> {
      const { data, error } = await db.from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toProfile(data) : null;
    },

    async list(): Promise<Profile[]> {
      const { data, error } = await db
        .from("profiles")
        .select(COLUMNS)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data.map(toProfile);
    },

    async countAdmins(): Promise<number> {
      const { count, error } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (error) throw error;
      return count ?? 0;
    },

    /** Returns the updated profile, or null when RLS/no row matched (nothing was changed). */
    async updateDisplayName(id: string, displayName: string): Promise<Profile | null> {
      const { data, error } = await db
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return data ? toProfile(data) : null;
    },

    /** Null when the profile does not exist, so callers can tell "no row" from "opted out". */
    async getOptIn(id: string, column: OptInColumn): Promise<boolean | null> {
      const { data, error } = await db
        .from("profiles")
        .select(column)
        .eq("id", id)
        .maybeSingle<OptInRow>();
      if (error) throw error;
      return data ? data[column] : null;
    },

    /**
     * Touches only this one column of this one row. False when no row matched (missing profile,
     * or RLS refused because the caller is not that user).
     */
    async setOptIn(id: string, column: OptInColumn, optIn: boolean): Promise<boolean> {
      const { data, error } = await db
        .from("profiles")
        .update(optInPatch(column, optIn))
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    /** Returns null when nothing changed: the target is missing or RLS/the role trigger refused. */
    async setRole(id: string, role: UserRole): Promise<Profile | null> {
      const { data, error } = await db
        .from("profiles")
        .update({ role })
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return data ? toProfile(data) : null;
    },
  };
}
