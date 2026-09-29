import type { FantasyTeamsRepository, TeamRef } from "@/data/fantasy-teams.repository";
import type { PendingClaim, TeamClaimsRepository, UserClaim } from "@/data/team-claims.repository";
import { isAdminRole, type Actor } from "@/domain/membership/membership";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type ClaimsDeps = {
  claims: Pick<
    TeamClaimsRepository,
    "create" | "listForUser" | "listPending" | "approve" | "reject"
  >;
  teams: Pick<FantasyTeamsRepository, "listUnclaimed" | "getOwnedBy" | "getOwnership">;
};

/** Where a member stands: they own a team, are waiting, were turned down, or haven't asked. */
export type ClaimState =
  | { status: "approved"; team: TeamRef }
  | { status: "pending"; claims: UserClaim[] }
  | { status: "rejected"; claims: UserClaim[] }
  | { status: "none" };

export type ClaimableTeam = TeamRef & { requested: boolean };

export type MyClaims = {
  state: ClaimState;
  /** Teams the member could still ask for; empty once they own one. */
  claimable: ClaimableTeam[];
};

export type SubmitClaimError = AppError<
  "already_owner" | "team_not_found" | "team_taken" | "duplicate_claim" | "not_allowed"
>;
export type AdminClaimError = AppError<"forbidden" | "not_found" | "already_reviewed" | "conflict">;

export function deriveClaimState(owned: TeamRef | null, claims: UserClaim[]): ClaimState {
  if (owned) return { status: "approved", team: owned };
  const pending = claims.filter((c) => c.status === "pending");
  if (pending.length > 0) return { status: "pending", claims: pending };
  const rejected = claims.filter((c) => c.status === "rejected");
  if (rejected.length > 0) return { status: "rejected", claims: rejected };
  return { status: "none" };
}

const forbidden = () => err("forbidden", "Only admins can review claims.");

export type ClaimsService = ReturnType<typeof createClaimsService>;

export function createClaimsService({ claims, teams }: ClaimsDeps) {
  return {
    async getMyClaims(userId: string): Promise<MyClaims> {
      const [owned, mine] = await Promise.all([
        teams.getOwnedBy(userId),
        claims.listForUser(userId),
      ]);
      const state = deriveClaimState(owned, mine);
      if (state.status === "approved") return { state, claimable: [] };

      const requestedIds = new Set(
        mine.filter((c) => c.status === "pending").map((c) => c.team.id),
      );
      const unclaimed = await teams.listUnclaimed();
      return {
        state,
        claimable: unclaimed.map((t) => ({ ...t, requested: requestedIds.has(t.id) })),
      };
    },

    async submitClaim(actor: Actor, teamId: string): Promise<Result<null, SubmitClaimError>> {
      // RLS would also reject these, but checking first lets us say why.
      if (await teams.getOwnedBy(actor.id)) {
        return err("already_owner", "You already own a team in this league.");
      }
      const ownership = await teams.getOwnership(teamId);
      if (!ownership) return err("team_not_found", "That team doesn't exist.");
      if (ownership.ownerId !== null) {
        return err("team_taken", "Someone already owns that team.");
      }

      const created = await claims.create(actor.id, teamId);
      if (created.ok) return ok(null);
      return created.error.code === "duplicate"
        ? err("duplicate_claim", "You already asked for this team. An admin will review it.")
        : err("not_allowed", created.error.message);
    },

    async listPendingClaims(actor: Actor): Promise<Result<PendingClaim[], AdminClaimError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      return ok(await claims.listPending());
    },

    async approveClaim(actor: Actor, claimId: string): Promise<Result<null, AdminClaimError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      return claims.approve(claimId);
    },

    async rejectClaim(actor: Actor, claimId: string): Promise<Result<null, AdminClaimError>> {
      if (!isAdminRole(actor.role)) return forbidden();
      return claims.reject(claimId);
    },
  };
}
