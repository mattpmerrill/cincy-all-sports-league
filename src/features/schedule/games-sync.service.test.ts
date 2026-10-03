import { describe, expect, it, vi } from "vitest";
import type { GameWrite } from "@/data/games.repository";
import type { SportTarget } from "@/data/sport-targets.repository";
import { GAME_SPORTS } from "@/domain/schedule";
import type { SportCode } from "@/domain/sports/sports";
import type { ScheduledGame, ScheduledGamesRequest } from "@/integrations/espn";
import type { Logger } from "@/lib/logger";
import { err, ok } from "@/lib/result";
import {
  createGamesSyncService,
  gamesWindow,
  type FetchGames,
  type GamesSyncDeps,
} from "./games-sync.service";

const target = (sport: SportCode, overrides: Partial<SportTarget> = {}): SportTarget => ({
  seasonId: "season-1",
  sportId: `${sport}-id`,
  sport,
  startsOn: "2026-08-27",
  endsOn: "2027-06-30",
  espnSeason: 2026,
  rules: [],
  participants: [],
  freeAgents: [],
  ...overrides,
});

const held = (...ids: (string | null)[]) =>
  ids.map((externalId, i) => ({ id: `p${i}`, name: `P${i}`, shortName: `P${i}`, externalId }));

const scheduled = (id: string): ScheduledGame => ({
  espnEventId: id,
  startsAt: new Date("2026-10-04T17:00:00Z"),
  timeTbd: false,
  status: "in_progress",
  statusDetail: "Q3 4:12",
  note: "Sunday Night Football",
  neutralSite: true,
  home: {
    espnTeamId: "23",
    name: "Pittsburgh Steelers",
    shortName: "PIT",
    score: 17,
    winner: null,
  },
  away: { espnTeamId: "4", name: "Cincinnati Bengals", shortName: "CIN", score: 20, winner: null },
});

const feed = (...games: ScheduledGame[]) =>
  ok({ games, requests: 2, failedRequests: 0, skipped: 0 });

function recordingLogger() {
  const lines: { level: string; msg: string; fields: Record<string, unknown> }[] = [];
  const make = (base: Record<string, unknown>): Logger => {
    const write =
      (level: string) =>
      (msg: string, fields: Record<string, unknown> = {}) => {
        lines.push({ level, msg, fields: { ...base, ...fields } });
      };
    return {
      debug: write("debug"),
      info: write("info"),
      warn: write("warn"),
      error: write("error"),
      child: (extra) => make({ ...base, ...extra }),
    };
  };
  return { logger: make({}), lines };
}

function setup(options: {
  targets: SportTarget[];
  fetchGames?: FetchGames;
  upsert?: GamesSyncDeps["games"]["upsertGames"];
}) {
  const requests: { sport: SportCode; request: ScheduledGamesRequest }[] = [];
  const upserts: { sportId: string; games: readonly GameWrite[] }[] = [];
  const { logger, lines } = recordingLogger();
  const invalidate = vi.fn();
  const service = createGamesSyncService({
    targets: { listSportTargets: async () => options.targets },
    games: {
      upsertGames:
        options.upsert ??
        (async (t, games) => {
          upserts.push({ sportId: t.sportId, games });
          return { inserted: games.length, updated: 0, unchanged: 0, unmappedSides: 0 };
        }),
    },
    fetchGames:
      options.fetchGames ??
      (async (sport, request) => {
        requests.push({ sport, request });
        return feed(scheduled(`${sport}-1`));
      }),
    invalidate,
    logger,
    newCorrelationId: () => "corr-1",
  });
  return { service, requests, upserts, invalidate, lines };
}

// Sun Oct 4 2026, 11:30 pm EDT: already Monday in UTC, still Sunday in Cincinnati.
const lateSunday = new Date("2026-10-05T03:30:00Z");

describe("gamesWindow", () => {
  it("live is yesterday and today in Eastern time, even when UTC has rolled over", () => {
    expect(gamesWindow("live", lateSunday)).toEqual({ from: "2026-10-03", to: "2026-10-04" });
  });

  it("weeks is this Eastern week and next, Monday to Sunday", () => {
    expect(gamesWindow("weeks", lateSunday)).toEqual({ from: "2026-09-28", to: "2026-10-11" });
    expect(gamesWindow("weeks", new Date("2026-10-05T04:00:00Z"))).toEqual({
      from: "2026-10-05",
      to: "2026-10-18",
    });
  });

  it("holds across the fall-back weekend", () => {
    // Sun Nov 1 2026 (clocks go back): the week is still Oct 26 - Nov 1 and next is Nov 2 - Nov 8.
    expect(gamesWindow("weeks", new Date("2026-11-01T12:00:00Z"))).toEqual({
      from: "2026-10-26",
      to: "2026-11-08",
    });
  });
});

describe("refreshGames: which sports are asked", () => {
  it("only asks sports whose season touches the window, and reports the rest as skipped", async () => {
    const { service, requests } = setup({
      targets: [
        target("nfl"),
        target("nba", { startsOn: "2026-10-20" }), // opens after next week
        target("mlb", { endsOn: "2026-09-20" }), // over before the window
        target("nhl", { startsOn: "2026-10-08" }), // opens within the next two weeks
      ],
    });
    const report = await service.refreshGames({ now: lateSunday, range: "weeks" });

    expect(requests.map((r) => r.sport).sort()).toEqual(["nfl", "nhl"]);
    expect(report.sports.find((s) => s.sport === "nba")).toMatchObject({
      status: "skipped",
      code: "outside_season",
    });
    expect(report.sports.find((s) => s.sport === "mlb")).toMatchObject({ code: "outside_season" });
  });

  it("asks only team sports, never golf or tennis", async () => {
    const asked: SportCode[][] = [];
    const targets = vi.fn(async (only?: readonly SportCode[]) => {
      asked.push([...(only ?? [])]);
      return [];
    });
    const { logger } = recordingLogger();
    const service = createGamesSyncService({
      targets: { listSportTargets: targets },
      games: {
        upsertGames: async () => ({ inserted: 0, updated: 0, unchanged: 0, unmappedSides: 0 }),
      },
      fetchGames: async () => feed(),
      invalidate: () => {},
      logger,
      newCorrelationId: () => "c",
    });
    await service.refreshGames({ now: lateSunday, range: "live" });
    expect(asked[0]).toEqual([...GAME_SPORTS]);
    expect(asked[0]).not.toContain("pga");
    expect(asked[0]).not.toContain("wta");
  });

  it("passes the window and the season's ESPN year to the feed", async () => {
    const { service, requests } = setup({ targets: [target("nfl", { espnSeason: 2026 })] });
    await service.refreshGames({ now: lateSunday, range: "live" });
    expect(requests[0]?.request).toMatchObject({
      window: { from: "2026-10-03", to: "2026-10-04" },
      espnSeason: 2026,
      espnTeamIds: undefined,
    });
  });

  it("gives college feeds only the held teams' ids, never a null, and skips a sport nobody holds", async () => {
    const { service, requests } = setup({
      targets: [
        target("ncaaf", { participants: held("2132", null, "2116") }),
        target("ncaab", { participants: [] }),
      ],
    });
    const report = await service.refreshGames({ now: lateSunday, range: "live" });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.request.espnTeamIds).toEqual(["2132", "2116"]);
    expect(report.sports.find((s) => s.sport === "ncaab")).toMatchObject({
      status: "skipped",
      code: "no_held_teams",
    });
  });
});

describe("refreshGames: writing", () => {
  it("renames ESPN's fact into the repository's write shape", async () => {
    const { service, upserts } = setup({ targets: [target("nfl")] });
    await service.refreshGames({ now: lateSunday, range: "live" });

    expect(upserts[0]?.sportId).toBe("nfl-id");
    expect(upserts[0]?.games[0]).toEqual({
      externalId: "nfl-1",
      startsAt: new Date("2026-10-04T17:00:00Z"),
      timeTbd: false,
      status: "in_progress",
      statusDetail: "Q3 4:12",
      note: "Sunday Night Football",
      neutralSite: true,
      home: {
        externalId: "23",
        name: "Pittsburgh Steelers",
        shortName: "PIT",
        score: 17,
        winner: null,
      },
      away: {
        externalId: "4",
        name: "Cincinnati Bengals",
        shortName: "CIN",
        score: 20,
        winner: null,
      },
    });
  });

  it("drops the cached games and reports counts when anything was written", async () => {
    const { service, invalidate } = setup({ targets: [target("nfl"), target("nhl")] });
    const report = await service.refreshGames({ now: lateSunday, range: "live" });
    expect(report).toMatchObject({ correlationId: "corr-1", range: "live", changed: true });
    expect(report.sports.map((s) => [s.sport, s.status, s.inserted])).toEqual([
      ["nfl", "succeeded", 1],
      ["nhl", "succeeded", 1],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache alone on a quiet run that found nothing new", async () => {
    const { service, invalidate } = setup({
      targets: [target("nfl")],
      upsert: async () => ({ inserted: 0, updated: 0, unchanged: 4, unmappedSides: 0 }),
    });
    const report = await service.refreshGames({ now: lateSunday, range: "live" });
    expect(report.changed).toBe(false);
    expect(report.sports[0]).toMatchObject({ unchanged: 4 });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("refreshGames: failure isolation", () => {
  it("keeps going when ESPN fails for one sport, and says which one and why", async () => {
    const { service, invalidate, lines } = setup({
      targets: [target("nfl"), target("mlb")],
      fetchGames: async (sport) =>
        sport === "nfl" ? err("espn_http", "ESPN responded 503") : feed(scheduled("m1")),
    });
    const report = await service.refreshGames({ now: lateSunday, range: "live" });

    expect(report.sports.map((s) => [s.sport, s.status, s.code])).toEqual([
      ["nfl", "failed", "espn_http"],
      ["mlb", "succeeded", undefined],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(lines.find((l) => l.msg === "games feed failed")?.fields).toMatchObject({
      sport: "nfl",
      code: "espn_http",
      correlationId: "corr-1",
    });
  });

  it("turns a database error in one sport into a failed outcome, logs it, and still refreshes the cache", async () => {
    const { service, invalidate, lines } = setup({
      targets: [target("nfl"), target("nhl")],
      upsert: async (t, games) => {
        if (t.sportId === "nfl-id") throw new Error("connection reset");
        return { inserted: games.length, updated: 0, unchanged: 0, unmappedSides: 0 };
      },
    });
    const report = await service.refreshGames({ now: lateSunday, range: "live" });

    expect(report.sports.map((s) => [s.sport, s.status, s.code])).toEqual([
      ["nfl", "failed", "unexpected"],
      ["nhl", "succeeded", undefined],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(lines.some((l) => l.level === "error" && l.msg === "games refresh failed")).toBe(true);
  });

  it("drops the cache after a database error even when no other sport wrote", async () => {
    const { service, invalidate } = setup({
      targets: [target("nfl")],
      upsert: async () => {
        throw new Error("boom");
      },
    });
    await service.refreshGames({ now: lateSunday, range: "live" });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("warns, but still stores what it got, when some of a sport's calls failed", async () => {
    const { service, upserts, lines } = setup({
      targets: [target("nfl")],
      fetchGames: async () =>
        ok({ games: [scheduled("a")], requests: 8, failedRequests: 2, skipped: 0 }),
    });
    const report = await service.refreshGames({ now: lateSunday, range: "weeks" });
    expect(upserts).toHaveLength(1);
    expect(report.sports[0]).toMatchObject({ status: "succeeded", failedRequests: 2 });
    expect(lines.find((l) => l.msg === "games feed partly failed")?.fields).toMatchObject({
      failedRequests: 2,
      requests: 8,
    });
  });

  it("logs one summary line under the run's correlation id", async () => {
    const { service, lines } = setup({
      targets: [target("nfl"), target("nba", { startsOn: "2027-01-01" })],
    });
    await service.refreshGames({ now: lateSunday, range: "live" });
    const summary = lines.find((l) => l.msg === "games refresh finished");
    expect(summary?.fields).toMatchObject({
      correlationId: "corr-1",
      range: "live",
      succeeded: 1,
      skipped: 1,
      failed: 0,
      inserted: 1,
    });
  });
});

describe("refreshGames: concurrency", () => {
  it("never runs more than three sports at once, and does run them side by side", async () => {
    let inFlight = 0;
    let peak = 0;
    const { service } = setup({
      targets: GAME_SPORTS.map((sport) => target(sport, { participants: held("1") })),
      fetchGames: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return feed();
      },
    });
    await service.refreshGames({ now: lateSunday, range: "live" });
    expect(peak).toBe(3);
  });
});
