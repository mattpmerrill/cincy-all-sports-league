import "server-only";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createTeamClaimsRepository } from "@/data/team-claims.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClaimsService } from "./claims.service";

/** Claims service acting as the signed-in visitor, so RLS is the final authority. */
export async function getClaimsService() {
  const db = await createSupabaseServerClient();
  return createClaimsService({
    claims: createTeamClaimsRepository(db),
    teams: createFantasyTeamsRepository(db),
  });
}
