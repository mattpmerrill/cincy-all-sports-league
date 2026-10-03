import { describe, expect, it, vi } from "vitest";
import type { TeamRef } from "@/data/fantasy-teams.repository";
import type { FreeAgentError } from "@/domain/free-agents";
import type { LeagueData, ParticipantData } from "@/domain/league";
import { leagueData, record, wins } from "@/domain/league/fixtures";
import type { Actor } from "@/domain/membership/membership";
import type { SportCode } from "@/domain/sports/sports";
import { AN_HOUR_AGO, IN_AN_HOUR, item, listing, offer, teamRef } from "@/domain/trades/fixtures";
import type { TradeListing } from "@/domain/trades";
import { createLogger } from "@/lib/logger";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { createFreeAgentsService } from "./free-agents.service";
import type { FreeAgentsServiceDeps } from "./free-agents.service";

const NOW = new Date("2026-09-29T12:00:00Z");

const owner = (id: string) => ({ id: `u-${id}`, displayName: `${id} owner`, avatarUrl: null });
const asActor = (id: string): Actor => ({ id: `u-${id}`, role: "member" });
const me = asActor("me");

const person = (id: string, name = id): ParticipantData => ({
  id,
  name,
  shortName: name,
  logoUrl: null,
  primaryColor: null,
});

/** The league fixture names each team's pick `<team>-<sport>`. */
const league = (over: Partial<Parameters<typeof leagueData>[0]> = {}) =>
  leagueData({
    teams: [
      { id: "me", owner: owner("me") },
      { id: "coop", owner: owner("coop") },
      { id: "papie", owner: owner("papie") },
    ],
    ...over,
  });

const NFL_CHAMPION = {
  participantId: "coop-nfl",
  ruleId: "nfl-champion",
  quantity: 1,
  eventLabel: "",
};

// The pool of a sport is every participant in it, held or not.
const POOL: Partial<Record<SportCode, ParticipantData[]>> = {
  mlb: [
    person("me-mlb"),
    person("coop-mlb"),
    person("papie-mlb"),
    person("fa-zebras", "Zebras"),
    person("fa-aardvarks", "Aardvarks"),
    person("fa-bears", "Bears"),
    person("fa-cubs", "Cubs"),
  ],
  wnba: [person("me-wnba"), person("coop-wnba"), person("fa-wnba", "Free WNBA")],
  nfl: [person("me-nfl"), person("coop-nfl"), person("fa-nfl", "Free NFL")],
};

type World = {
  /** What the cached read returns; the fresh read uses `fresh` and falls back to this. */
  cached?: LeagueData | null;
  fresh?: LeagueData | null;
  /** The team the user owns; null means none. Defaults to `me` for `u-me` only. */
  myTeam?: TeamRef | null;
  open?: TradeListing[];
  refresh?: Result<null, AppError>;
  move?: Result<{ moveId: string }, FreeAgentError>;
};

function setup(world: World = {}) {
  const cached = world.cached === undefined ? league() : world.cached;
  const fresh = world.fresh === undefined ? cached : world.fresh;
  let refreshed = false;
  const refreshCalls: { sport: SportCode; ids: readonly string[] }[] = [];
  const moveCalls: Record<string, unknown>[] = [];
  const openListings = vi.fn(async () => world.open ?? []);
  const known = new Map(
    Object.entries(POOL).flatMap(([sport, rows]) =>
      (rows ?? []).map((p) => [p.id, { sport: sport as SportCode, participant: p }] as const),
    ),
  );

  const deps: FreeAgentsServiceDeps = {
    loadCachedData: async () => cached,
    // The database only holds the refreshed facts once the refresh has run, so a fresh read that
    // starts earlier sees the old ones. This is what pins "refresh, then read".
    loadFreshData: async () => (refreshed ? fresh : cached),
    pool: { list: async (sport) => POOL[sport] ?? [] },
    repo: {
      getParticipant: async (id) => known.get(id) ?? null,
      listRecentMoves: vi.fn(async () => []),
    },
    mutations: () => ({
      makeMove: async (input) => {
        moveCalls.push(input);
        return world.move ?? ok({ moveId: "move-1" });
      },
    }),
    teams: {
      getOwnedBy: async (userId) => {
        if (world.myTeam !== undefined) return world.myTeam;
        return userId === "u-me" ? { id: "me", name: "me", slug: "me" } : null;
      },
    },
    trades: { listOpenListings: openListings },
    refreshFacts: async (sport, ids) => {
      refreshCalls.push({ sport, ids });
      // Completion, not the call, is what makes the facts visible: a read started while the
      // refresh is still running must not see them.
      await Promise.resolve();
      refreshed = true;
      return world.refresh ?? ok(null);
    },
    now: () => NOW,
    logger: { ...createLogger(), warn: vi.fn(), child: () => createLogger() },
  };
  return {
    service: createFreeAgentsService(deps),
    deps,
    refreshCalls,
    moveCalls,
    openListings,
  };
}

const failure = (code: string) =>
  expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) });

/** A move of me's MLB pick for the free agent Zebras unless overridden. */
const mlb = (over: { dropId?: string; addId?: string } = {}) => ({
  sport: "mlb" as const,
  dropId: "me-mlb",
  addId: "fa-zebras",
  ...over,
});

describe("makeMove: checks before ESPN", () => {
  it("refuses someone without an approved team", async () => {
    const { service, refreshCalls, moveCalls } = setup();
    expect(await service.makeMove(asActor("nobody"), mlb())).toEqual(failure("not_owner"));
    expect(refreshCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
  });

  it("refuses a sport whose season is over and never asks ESPN", async () => {
    const over = league({ results: [NFL_CHAMPION] });
    const { service, refreshCalls, moveCalls } = setup({ cached: over });
    const result = await service.makeMove(me, { sport: "nfl", dropId: "me-nfl", addId: "fa-nfl" });
    expect(result).toEqual({
      ok: false,
      error: { code: "sport_locked", message: "The NFL season is over, so moves are closed." },
    });
    expect(refreshCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
  });

  it("refuses a participant another team holds without asking ESPN", async () => {
    const { service, refreshCalls, moveCalls } = setup();
    const result = await service.makeMove(me, mlb({ addId: "papie-mlb" }));
    expect(result).toEqual(failure("not_free_agent"));
    expect(refreshCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
  });

  it("refuses a drop that is not the current pick, and an id that matches nobody", async () => {
    const { service, refreshCalls } = setup();
    expect(await service.makeMove(me, mlb({ dropId: "coop-mlb" }))).toEqual(failure("stale_pick"));
    expect(await service.makeMove(me, mlb({ addId: "no-such-id" }))).toEqual(failure("not_found"));
    expect(refreshCalls).toEqual([]);
  });

  it("refuses a participant from another sport as not found", async () => {
    const { service, refreshCalls } = setup();
    expect(await service.makeMove(me, mlb({ addId: "fa-nfl" }))).toEqual(failure("not_found"));
    expect(refreshCalls).toEqual([]);
  });
});

describe("makeMove: refreshing facts", () => {
  it("refreshes exactly the dropped and the added participant, for the sport", async () => {
    const { service, refreshCalls } = setup();
    await service.makeMove(me, mlb());
    expect(refreshCalls).toEqual([{ sport: "mlb", ids: ["me-mlb", "fa-zebras"] }]);
  });

  it("returns facts_unavailable and writes nothing when ESPN cannot answer", async () => {
    const { service, moveCalls, deps } = setup({
      refresh: err("espn_unavailable", "ESPN returned 503 from https://site.api.espn.com/secret"),
    });
    const result = await service.makeMove(me, mlb());
    expect(result).toEqual({
      ok: false,
      error: {
        code: "facts_unavailable",
        message:
          "We couldn't get the latest scores from ESPN, so nothing changed. Try again in a minute.",
      },
    });
    expect(moveCalls).toEqual([]);
    // The provider's words reach the log only.
    expect(deps.logger.warn).toHaveBeenCalledWith(
      "free-agent facts refresh failed",
      expect.objectContaining({ code: "espn_unavailable" }),
    );
  });

  it.each(["espn_unavailable", "sport_not_in_season"])(
    "treats a %s refresh error like any other: facts_unavailable, nothing written",
    async (code) => {
      const { service, moveCalls } = setup({ refresh: err(code, "provider words") });
      expect(await service.makeMove(me, mlb())).toEqual(failure("facts_unavailable"));
      expect(moveCalls).toEqual([]);
    },
  );

  it("says there is no season when there is none, keeping the invalid_sport code", async () => {
    const { service } = setup({ cached: null, myTeam: { id: "me", name: "me", slug: "me" } });
    expect(await service.makeMove(me, mlb())).toEqual({
      ok: false,
      error: { code: "invalid_sport", message: "There isn't an active season right now." },
    });
  });

  it("checks again on fresh data: a pick that changed while ESPN was asked", async () => {
    // The cache still shows me holding me-mlb; the database already moved the pick.
    const { service, moveCalls } = setup({
      fresh: league({ teams: [{ id: "me", owner: owner("me"), sharedPicks: { mlb: "fa-cubs" } }] }),
    });
    expect(await service.makeMove(me, mlb())).toEqual(failure("stale_pick"));
    expect(moveCalls).toEqual([]);
  });

  it("checks again on fresh data: the free agent was taken meanwhile", async () => {
    const { service, moveCalls } = setup({
      fresh: league({
        teams: [
          { id: "me", owner: owner("me") },
          { id: "coop", owner: owner("coop"), sharedPicks: { mlb: "fa-zebras" } },
        ],
      }),
    });
    expect(await service.makeMove(me, mlb())).toEqual(failure("not_free_agent"));
    expect(moveCalls).toEqual([]);
  });

  it("checks again on fresh data: the refresh recorded the champion", async () => {
    const { service, refreshCalls, moveCalls } = setup({
      fresh: league({ results: [NFL_CHAMPION] }),
    });
    const result = await service.makeMove(me, { sport: "nfl", dropId: "me-nfl", addId: "fa-nfl" });
    expect(result).toEqual(failure("sport_locked"));
    expect(refreshCalls).toHaveLength(1);
    expect(moveCalls).toEqual([]);
  });
});

describe("makeMove: the write", () => {
  // Cached and fresh facts differ on purpose: only the fresh ones may price the move.
  const staleCache = () =>
    league({
      teams: [
        { id: "me", owner: owner("me"), baselines: { mlb: { total: 2 } } },
        { id: "coop", owner: owner("coop") },
      ],
      results: [wins("me-mlb", 1), wins("fa-zebras", 1, "mlb")],
    });
  const freshFacts = () =>
    league({
      teams: [
        { id: "me", owner: owner("me"), baselines: { mlb: { total: 2 } } },
        { id: "coop", owner: owner("coop") },
      ],
      // me-mlb: 3 wins = 6 live (2 of it from before the team held it); the free agent: 4 wins = 8.
      results: [wins("me-mlb", 3), wins("fa-zebras", 4, "mlb")],
    });

  it("passes the live scores of both participants and the post to the repository", async () => {
    const { service, moveCalls } = setup({ cached: staleCache(), fresh: freshFacts() });
    const result = await service.makeMove(me, mlb());

    expect(result).toEqual({
      ok: true,
      value: {
        moveId: "move-1",
        dropped: expect.objectContaining({ id: "me-mlb" }),
        added: expect.objectContaining({ id: "fa-zebras", name: "Zebras" }),
      },
    });
    expect(moveCalls).toEqual([
      {
        actorId: "u-me",
        sport: "mlb",
        dropId: "me-mlb",
        addId: "fa-zebras",
        scores: [
          { participantId: "me-mlb", points: 6, championships: 0, postseasonPoints: 0 },
          { participantId: "fa-zebras", points: 8, championships: 0, postseasonPoints: 0 },
        ],
        post: {
          body: "me dropped me-mlb (MLB) and picked up Zebras.",
          payload: {
            type: "free_agent_move",
            team: { name: "me", slug: "me" },
            sport: "mlb",
            dropped: "me-mlb",
            added: "Zebras",
          },
        },
      },
    ]);
  });

  it("reads the fresh facts only after the refresh has completed", async () => {
    // Run in parallel with the refresh, the read would start first and price the move on the
    // stale facts (2 and 2 points) instead of 6 and 8.
    const { service, moveCalls } = setup({ cached: staleCache(), fresh: freshFacts() });
    await service.makeMove(me, mlb());
    expect(moveCalls[0]?.scores).toEqual([
      expect.objectContaining({ participantId: "me-mlb", points: 6 }),
      expect.objectContaining({ participantId: "fa-zebras", points: 8 }),
    ]);
  });

  it("lets a WNBA team add a participant another team holds", async () => {
    const { service, moveCalls } = setup();
    const result = await service.makeMove(me, {
      sport: "wnba",
      dropId: "me-wnba",
      addId: "coop-wnba",
    });
    expect(result.ok).toBe(true);
    expect(moveCalls).toHaveLength(1);
  });

  it("passes busy through unchanged", async () => {
    const busy = {
      code: "busy",
      message: "Someone else was making a move at the same moment. Try again.",
    } as const;
    const { service } = setup({ move: { ok: false, error: busy } });
    expect(await service.makeMove(me, mlb())).toEqual({ ok: false, error: busy });
  });

  it("returns the typed error when SQL says someone won the race", async () => {
    const { service } = setup({
      move: {
        ok: false,
        error: {
          code: "not_free_agent",
          message: "Another team just picked them up. Choose another free agent.",
        },
      },
    });
    expect(await service.makeMove(me, mlb())).toEqual({
      ok: false,
      error: {
        code: "not_free_agent",
        message: "Another team just picked them up. Choose another free agent.",
      },
    });
  });
});

describe("getSportBoard", () => {
  const board = (viewer: { id: string } | null = { id: "u-me" }, world: World = {}) =>
    setup({
      cached: league({
        results: [
          wins("fa-bears", 3, "mlb"),
          wins("fa-cubs", 3, "mlb"),
          wins("fa-zebras", 5, "mlb"),
        ],
        // Free agents carry records too: the league data holds every participant's.
        records: [record("fa-zebras", 5, 2)],
      }),
      ...world,
    }).service.getSportBoard(viewer, "mlb");

  it("lists only free agents, by points and then by name, in the minimal row shape", async () => {
    const result = await board();
    expect(result?.freeAgents).toEqual([
      {
        id: "fa-zebras",
        name: "Zebras",
        shortName: "Zebras",
        logoUrl: null,
        points: 10,
        statLine: "5 wins",
        record: { kind: "record", text: "5-2", label: "Regular-season record" },
      },
      {
        id: "fa-bears",
        name: "Bears",
        shortName: "Bears",
        logoUrl: null,
        points: 6,
        statLine: "3 wins",
        record: null,
      },
      {
        id: "fa-cubs",
        name: "Cubs",
        shortName: "Cubs",
        logoUrl: null,
        points: 6,
        statLine: "3 wins",
        record: null,
      },
      {
        id: "fa-aardvarks",
        name: "Aardvarks",
        shortName: "Aardvarks",
        logoUrl: null,
        points: 0,
        statLine: null,
        record: null,
      },
    ]);
  });

  it("shows the owner their pick with credited points and lets them act", async () => {
    const result = await setup({
      cached: league({
        teams: [{ id: "me", owner: owner("me"), baselines: { mlb: { total: 2 } } }],
        results: [wins("me-mlb", 3, "mlb")],
      }),
    }).service.getSportBoard({ id: "u-me" }, "mlb");
    expect(result).toMatchObject({
      canAct: true,
      blockedReason: null,
      locked: false,
      myTeam: { id: "me" },
      // 6 live minus the 2 the team did not earn.
      myPick: { participant: { id: "me-mlb" }, points: 4 },
    });
  });

  it("offers everything but their own pick in the WNBA, where teams may share", async () => {
    const owned = await setup().service.getSportBoard({ id: "u-me" }, "wnba");
    expect(owned?.freeAgents.map((p) => p.id).sort()).toEqual(["coop-wnba", "fa-wnba"]);
    const visitor = await setup().service.getSportBoard(null, "wnba");
    expect(visitor?.freeAgents.map((p) => p.id).sort()).toEqual([
      "coop-wnba",
      "fa-wnba",
      "me-wnba",
    ]);
  });

  it("lets a visitor browse but not act, and reads no listings for them", async () => {
    const { service, openListings } = setup();
    const result = await service.getSportBoard(null, "mlb");
    expect(result).toMatchObject({
      canAct: false,
      blockedReason: "Sign in to make moves.",
      myTeam: null,
      myPick: null,
      sideEffects: { listings: 0, offersReceived: 0, offersMade: 0 },
    });
    expect(result?.freeAgents.length).toBeGreaterThan(0);
    expect(openListings).not.toHaveBeenCalled();
  });

  it("tells a member without an approved team why they cannot move", async () => {
    const result = await board({ id: "u-stranger" });
    expect(result).toMatchObject({
      canAct: false,
      blockedReason: "You need an approved team in this league to make moves.",
      myTeam: null,
      myPick: null,
    });
  });

  it("still lists a finished sport but closes it to moves", async () => {
    const { service } = setup({ cached: league({ results: [NFL_CHAMPION] }) });
    const result = await service.getSportBoard({ id: "u-me" }, "nfl");
    expect(result).toMatchObject({
      canAct: false,
      locked: true,
      lockedReason: "The NFL season is over, so moves are closed.",
      blockedReason: "The NFL season is over, so moves are closed.",
    });
    expect(result?.freeAgents.map((p) => p.id)).toEqual(["fa-nfl"]);
  });

  it("counts the listings and offers a move would cancel", async () => {
    const mine = teamRef("me");
    const open = [
      // Live listing with the MLB pick and two pending offers from others: 1 listing, 2 received.
      listing({
        id: "l-mine",
        ownerTeam: mine,
        items: [item("mlb", "me-mlb")],
        offers: [
          offer({ id: "o1", offeringTeam: teamRef("coop") }),
          offer({ id: "o2", offeringTeam: teamRef("papie") }),
        ],
      }),
      // Only another sport: untouched.
      listing({ id: "l-nba", ownerTeam: mine, items: [item("nba", "me-nba")] }),
      // Past its window: SQL leaves it alone, so it is not counted.
      listing({
        id: "l-old",
        ownerTeam: mine,
        items: [item("mlb", "me-mlb")],
        closesAt: AN_HOUR_AGO,
        offers: [offer({ id: "o3", offeringTeam: teamRef("coop") })],
      }),
      // Someone else's listing where my pending offer gives the MLB pick: 1 made.
      listing({
        id: "l-coop",
        ownerTeam: teamRef("coop"),
        items: [item("mlb", "coop-mlb")],
        closesAt: IN_AN_HOUR,
        offers: [offer({ id: "o4", offeringTeam: mine, legs: [item("mlb", "me-mlb")] })],
      }),
    ];
    const { service, openListings } = setup({ open });
    const result = await service.getSportBoard({ id: "u-me" }, "mlb");
    expect(result?.sideEffects).toEqual({ listings: 1, offersReceived: 2, offersMade: 1 });
    expect(openListings).toHaveBeenCalledWith(NOW);
  });
});

describe("getHub", () => {
  it("has a row per sport with the viewer's pick, lock state and the recent moves", async () => {
    const { service, deps } = setup({ cached: league({ results: [NFL_CHAMPION] }) });
    const hub = await service.getHub({ id: "u-me" });

    expect(hub).toMatchObject({ canAct: true, blockedReason: null, myTeam: { id: "me" } });
    expect(hub.sports).toHaveLength(11);
    expect(hub.sports.find((s) => s.sport === "mlb")).toMatchObject({
      name: "MLB",
      locked: false,
      myPick: { participant: { id: "me-mlb" }, points: 0 },
    });
    expect(hub.sports.find((s) => s.sport === "nfl")).toMatchObject({ locked: true });
    expect(deps.repo.listRecentMoves).toHaveBeenCalledWith({ limit: 30 });
  });

  it("shows a visitor the sports without picks or an Add path", async () => {
    const { service } = setup();
    const hub = await service.getHub(null);
    expect(hub).toMatchObject({
      canAct: false,
      blockedReason: "Sign in to make moves.",
      myTeam: null,
    });
    expect(hub.sports.every((s) => s.myPick === null)).toBe(true);
  });

  it("says why a member without a team cannot move", async () => {
    const { service } = setup();
    const hub = await service.getHub({ id: "u-stranger" });
    expect(hub).toMatchObject({
      canAct: false,
      blockedReason: "You need an approved team in this league to make moves.",
    });
  });

  it("copes with no active season", async () => {
    const { service } = setup({ cached: null });
    expect(await service.getHub({ id: "u-me" })).toMatchObject({
      canAct: false,
      sports: [],
      recentMoves: [],
    });
  });
});
