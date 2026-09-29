import { describe, expect, it, vi } from "vitest";
import { FREE_AGENT_ERROR_CODES, freeAgentMovePost } from "@/domain/free-agents";
import type { DbClient } from "./db-client";
import {
  createFreeAgentsRepository,
  toFreeAgentError,
  toFreeAgentMove,
} from "./free-agents.repository";
import type { MoveRow } from "./free-agents.repository";

const participant = (id: string, name = id) => ({
  id,
  name,
  short_name: name,
  logo_url: null,
  primary_color: null,
});

const moveRow: MoveRow = {
  id: "m1",
  created_at: "2026-09-29T12:00:00Z",
  sports: { code: "mlb" },
  fantasy_teams: {
    id: "t1",
    slug: "coop",
    name: "Coop Doggies",
    profiles: { id: "u1", display_name: "Cooper", avatar_url: null },
  },
  dropped: participant("rangers", "Texas Rangers"),
  added: participant("cardinals", "St. Louis Cardinals"),
};

describe("toFreeAgentMove", () => {
  it("keeps the dropped and added participants apart and maps the team and owner", () => {
    expect(toFreeAgentMove(moveRow)).toMatchObject({
      id: "m1",
      sport: "mlb",
      createdAt: "2026-09-29T12:00:00Z",
      team: { id: "t1", slug: "coop", owner: { displayName: "Cooper" } },
      dropped: { id: "rangers", name: "Texas Rangers" },
      added: { id: "cardinals", name: "St. Louis Cardinals" },
    });
  });

  it("keeps an unowned team's owner as null and fails loudly on an unknown sport", () => {
    const unowned = { ...moveRow, fantasy_teams: { ...moveRow.fantasy_teams, profiles: null } };
    expect(toFreeAgentMove(unowned).team.owner).toBeNull();
    expect(() => toFreeAgentMove({ ...moveRow, sports: { code: "curling" } })).toThrow(/curling/);
  });
});

describe("toFreeAgentError", () => {
  const raised = (message: string) => ({ code: "P0001", message });
  // The tokens `make_free_agent_move` raises; the other codes never come from SQL.
  const SQL_TOKENS = [
    "not_owner",
    "invalid_sport",
    "same_participant",
    "stale_pick",
    "not_found",
    "not_free_agent",
    "missing_scores",
  ] as const;

  it("maps every token the function raises to its code with a message a person can read", () => {
    for (const token of SQL_TOKENS) {
      const mapped = toFreeAgentError(raised(token));
      expect(mapped?.code).toBe(token);
      expect(mapped?.message).not.toContain("_");
    }
  });

  it("has a message for every code, and none of them uses an em dash", () => {
    // The typed record guarantees coverage at compile time; this guards the wording rule.
    for (const code of FREE_AGENT_ERROR_CODES) {
      const mapped = toFreeAgentError(raised(code));
      expect(mapped?.message).toBeTruthy();
      expect(mapped?.message).not.toContain("—");
    }
  });

  it.each(["40P01", "40001"])("maps SQLSTATE %s to busy instead of throwing", (code) => {
    expect(toFreeAgentError({ code, message: "deadlock detected" })).toEqual({
      code: "busy",
      message: "Someone else was making a move at the same moment. Try again.",
    });
  });

  it("does not claim errors it does not own", () => {
    expect(toFreeAgentError({ code: "42501", message: "not_owner" })).toBeNull();
    expect(toFreeAgentError(raised("something else"))).toBeNull();
    expect(toFreeAgentError({ code: "23505", message: "duplicate key" })).toBeNull();
  });
});

describe("makeMove", () => {
  const stub = (result: { data?: unknown; error?: unknown }) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
    return { rpc, repo: createFreeAgentsRepository({ rpc } as unknown as DbClient) };
  };
  const post = freeAgentMovePost({
    team: { name: "Coop", slug: "coop" },
    sport: "mlb",
    dropped: {
      id: "rangers",
      name: "Texas Rangers",
      shortName: "TEX",
      logoUrl: null,
      primaryColor: null,
    },
    added: {
      id: "cardinals",
      name: "Cardinals",
      shortName: "STL",
      logoUrl: null,
      primaryColor: null,
    },
  });
  const input = {
    actorId: "u1",
    sport: "mlb" as const,
    dropId: "rangers",
    addId: "cardinals",
    scores: [
      { participantId: "rangers", points: 6, championships: 0, postseasonPoints: 0 },
      { participantId: "cardinals", points: 4, championships: 1, postseasonPoints: 50 },
    ],
    post,
  };

  it("calls the function with the exact parameter names, snake_case scores and the post", async () => {
    const { rpc, repo } = stub({ data: "m-new" });
    expect(await repo.makeMove(input)).toEqual({ ok: true, value: { moveId: "m-new" } });
    expect(rpc).toHaveBeenCalledWith("make_free_agent_move", {
      p_actor: "u1",
      p_sport_code: "mlb",
      p_drop_participant_id: "rangers",
      p_add_participant_id: "cardinals",
      p_scores: [
        { participant_id: "rangers", points: 6, championships: 0, postseason_points: 0 },
        { participant_id: "cardinals", points: 4, championships: 1, postseason_points: 50 },
      ],
      p_post_body: post.body,
      p_post_payload: post.payload,
    });
  });

  it("returns a typed failure for a token, and busy for a deadlock", async () => {
    const lost = stub({ error: { code: "P0001", message: "not_free_agent", details: "" } });
    expect(await lost.repo.makeMove(input)).toEqual({
      ok: false,
      error: {
        code: "not_free_agent",
        message: "Another team just picked them up. Choose another free agent.",
      },
    });
    const deadlock = stub({ error: { code: "40P01", message: "deadlock detected" } });
    expect(await deadlock.repo.makeMove(input)).toMatchObject({
      ok: false,
      error: { code: "busy" },
    });
  });

  it("throws anything it cannot map, so an outage is never a user error", async () => {
    const boom = { code: "42501", message: "permission denied for function", details: "" };
    const { repo } = stub({ error: boom });
    await expect(repo.makeMove(input)).rejects.toBe(boom);
  });
});

describe("listRecentMoves", () => {
  it("is empty when there is no active season, without querying moves", async () => {
    const from = vi.fn((table: string) => {
      if (table !== "seasons") throw new Error(`unexpected query on ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    });
    const repo = createFreeAgentsRepository({ from } as unknown as DbClient);
    expect(await repo.listRecentMoves({ limit: 10 })).toEqual([]);
  });
});
