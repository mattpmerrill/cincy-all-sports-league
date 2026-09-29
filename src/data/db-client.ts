import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** The typed client every repository is built on. RLS applies when it acts as a signed-in user. */
export type DbClient = SupabaseClient<Database>;

/** Postgres SQLSTATEs that repositories translate into typed failures. */
export const PG = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  insufficientPrivilege: "42501",
  noDataFound: "P0002",
  foreignKeyViolation: "23503",
  /** RAISE EXCEPTION with no explicit errcode: the feed's 'rate_limited' trigger uses it. */
  raiseException: "P0001",
} as const;
