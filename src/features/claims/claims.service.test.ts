import { describe, expect, it } from "vitest";
import type { TeamRef } from "@/data/fantasy-teams.repository";
import type { UserClaim } from "@/data/team-claims.repository";
import type { Actor } from "@/domain/membership/membership";
import { err, ok } from "@/lib/result";
import { createClaimsService, deriveClaimState, type ClaimsDeps } from "./claims.service";

const team = (id: string): TeamRef => ({ id, name: `Team ${id}`, slug: `team-${id}` });
const claim = (id: string, status: UserClaim["status"], teamId = "t1"): UserClaim => ({
  id,
  status,
  team: team(teamId),
  createdAt: "2026-09-28T00:00:00Z",
  reviewedAt: status === "pending" ? null : "2026-09-28T01:00:00Z",
});

const member: Actor = { id: "u1", role: "member" };
const admin: Actor = { id: "a1", role: "admin" };

type World = {
  owned?: TeamRef | null;
  ownership?: { team: TeamRef; ownerId: string | null } | null;
  mine?: UserClaim[];
  unclaimed?: TeamRef[];
  createResult?: Awaited<ReturnType<ClaimsDeps["claims"]["create"]>>;
};

function setup(world: World = {}) {
  const calls = {
    create: [] as [string, string][],
    approve: [] as string[],
    reject: [] as string[],
  };
  const deps: ClaimsDeps = {
    teams: {
      getOwnedBy: async () => world.owned ?? null,
      getOwnership: async () => world.ownership ?? null,
      listUnclaimed: async () => world.unclaimed ?? [],
    },
    claims: {
      create: async (userId, teamId) => {
        calls.create.push([userId, teamId]);
        return world.createResult ?? ok(null);
      },
      listForUser: async () => world.mine ?? [],
      listPending: async () => [],
      approve: async (id) => {
        calls.approve.push(id);
        return ok(null);
      },
      reject: async (id) => {
        calls.reject.push(id);
        return ok(null);
      },
    },
  };
  return { service: createClaimsService(deps), calls };
}

describe("deriveClaimState", () => {
  it("owning a team wins over any claim history", () => {
    expect(deriveClaimState(team("t1"), [claim("c1", "rejected")]).status).toBe("approved");
  });

  it("pending beats rejected", () => {
    const state = deriveClaimState(null, [claim("c1", "rejected"), claim("c2", "pending", "t2")]);
    expect(state).toMatchObject({ status: "pending", claims: [{ id: "c2" }] });
  });

  it("is rejected only when nothing is pending, and none with no claims", () => {
    expect(deriveClaimState(null, [claim("c1", "rejected")]).status).toBe("rejected");
    expect(deriveClaimState(null, []).status).toBe("none");
  });
});

describe("submitClaim", () => {
  const open = { team: team("t1"), ownerId: null };

  it("creates a claim on an open team", async () => {
    const { service, calls } = setup({ ownership: open });
    expect((await service.submitClaim(member, "t1")).ok).toBe(true);
    expect(calls.create).toEqual([["u1", "t1"]]);
  });

  it("refuses when the member already owns a team, without touching the database", async () => {
    const { service, calls } = setup({ owned: team("t9"), ownership: open });
    const result = await service.submitClaim(member, "t1");
    expect(result).toMatchObject({ ok: false, error: { code: "already_owner" } });
    expect(calls.create).toEqual([]);
  });

  it("refuses a team that someone else owns", async () => {
    const { service, calls } = setup({ ownership: { team: team("t1"), ownerId: "other" } });
    expect(await service.submitClaim(member, "t1")).toMatchObject({
      ok: false,
      error: { code: "team_taken" },
    });
    expect(calls.create).toEqual([]);
  });

  it("refuses a team that doesn't exist", async () => {
    const { service } = setup({ ownership: null });
    expect(await service.submitClaim(member, "nope")).toMatchObject({
      ok: false,
      error: { code: "team_not_found" },
    });
  });

  it("turns the repository's duplicate into a friendly error", async () => {
    const { service } = setup({
      ownership: open,
      createResult: err("duplicate", "raw"),
    });
    expect(await service.submitClaim(member, "t1")).toMatchObject({
      ok: false,
      error: { code: "duplicate_claim" },
    });
  });
});

describe("getMyClaims", () => {
  it("offers no teams once the member owns one", async () => {
    const { service } = setup({ owned: team("t1"), unclaimed: [team("t2")] });
    const result = await service.getMyClaims("u1");
    expect(result.state.status).toBe("approved");
    expect(result.claimable).toEqual([]);
  });

  it("marks teams the member already requested", async () => {
    const { service } = setup({
      mine: [claim("c1", "pending", "t2")],
      unclaimed: [team("t2"), team("t3")],
    });
    const { claimable } = await service.getMyClaims("u1");
    expect(claimable.map((t) => [t.id, t.requested])).toEqual([
      ["t2", true],
      ["t3", false],
    ]);
  });
});

describe("admin review", () => {
  it("members cannot list, approve or reject", async () => {
    const { service, calls } = setup();
    for (const result of [
      await service.listPendingClaims(member),
      await service.approveClaim(member, "c1"),
      await service.rejectClaim(member, "c1"),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
    expect(calls.approve).toEqual([]);
    expect(calls.reject).toEqual([]);
  });

  it("admins reach the repository", async () => {
    const { service, calls } = setup();
    await service.approveClaim(admin, "c1");
    await service.rejectClaim(admin, "c2");
    expect(calls).toMatchObject({ approve: ["c1"], reject: ["c2"] });
  });
});
