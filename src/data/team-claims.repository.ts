import { err, ok, type AppError, type Result } from "@/lib/result";
import type { ClaimStatus } from "@/domain/membership/membership";
import { PG, type DbClient } from "./db-client";
import type { TeamRef } from "./fantasy-teams.repository";

export type UserClaim = {
  id: string;
  status: ClaimStatus;
  team: TeamRef;
  createdAt: string;
  reviewedAt: string | null;
};

export type PendingClaim = {
  id: string;
  createdAt: string;
  team: TeamRef;
  claimant: { id: string; displayName: string; avatarUrl: string | null };
};

export type CreateClaimError = AppError<"duplicate" | "not_allowed">;
export type ReviewClaimError = AppError<
  "forbidden" | "not_found" | "already_reviewed" | "conflict"
>;

const TEAM = "fantasy_teams!team_claims_fantasy_team_id_fkey(id, name, slug)";
const CLAIMANT = "profiles!team_claims_user_id_fkey(id, display_name, avatar_url)";

export type TeamClaimsRepository = ReturnType<typeof createTeamClaimsRepository>;

export function createTeamClaimsRepository(db: DbClient) {
  /** approve/reject are SQL functions so the claim and the team owner change atomically. */
  async function review(
    fn: "approve_team_claim" | "reject_team_claim",
    claimId: string,
  ): Promise<Result<null, ReviewClaimError>> {
    const { error } = await db.rpc(fn, { claim_id: claimId });
    if (!error) return ok(null);
    switch (error.code) {
      case PG.insufficientPrivilege:
        return err("forbidden", "Only admins can review claims.");
      case PG.noDataFound:
        return err("not_found", "That claim no longer exists.");
      case PG.checkViolation:
        return err("already_reviewed", "That claim was already reviewed.");
      case PG.uniqueViolation:
        return err("conflict", "That team or member is already matched.");
      default:
        throw error;
    }
  }

  return {
    async create(userId: string, teamId: string): Promise<Result<null, CreateClaimError>> {
      const { error } = await db
        .from("team_claims")
        .insert({ user_id: userId, fantasy_team_id: teamId });
      if (!error) return ok(null);
      if (error.code === PG.uniqueViolation) {
        return err("duplicate", "You already asked for this team.");
      }
      // The insert policy only admits pending claims on unowned teams for yourself.
      if (error.code === PG.insufficientPrivilege) {
        return err("not_allowed", "That team can't be claimed right now.");
      }
      throw error;
    },

    async listForUser(userId: string): Promise<UserClaim[]> {
      const { data, error } = await db
        .from("team_claims")
        .select(`id, status, created_at, reviewed_at, ${TEAM}`)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.flatMap((row) =>
        row.fantasy_teams
          ? [
              {
                id: row.id,
                status: row.status,
                team: row.fantasy_teams,
                createdAt: row.created_at,
                reviewedAt: row.reviewed_at,
              },
            ]
          : [],
      );
    },

    async listPending(): Promise<PendingClaim[]> {
      const { data, error } = await db
        .from("team_claims")
        .select(`id, created_at, ${TEAM}, ${CLAIMANT}`)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.flatMap((row) =>
        row.fantasy_teams && row.profiles
          ? [
              {
                id: row.id,
                createdAt: row.created_at,
                team: row.fantasy_teams,
                claimant: {
                  id: row.profiles.id,
                  displayName: row.profiles.display_name,
                  avatarUrl: row.profiles.avatar_url,
                },
              },
            ]
          : [],
      );
    },

    approve: (claimId: string) => review("approve_team_claim", claimId),
    reject: (claimId: string) => review("reject_team_claim", claimId),
  };
}
