import { describe, expect, it } from "vitest";
import handBuiltNflDay from "./__fixtures__/handbuilt-scoreboard-nfl-2026-10-04.json";
import handBuiltCfbSchedule from "./__fixtures__/handbuilt-schedule-ncaaf-2132-2026.json";
import { fetchScheduledGames, gameFromEvent, gamesFromEvents, mapGameStatus } from "./games";
import { gamesScoreboardSchema, gamesTeamScheduleSchema } from "./schemas";
import { jsonResponse, noSleep, scriptedFetch } from "./test-utils";

// Every fixture here is HAND-BUILT from ESPN's known response shape (the live API was blocked
// when this was written), so these tests prove our mapping of that shape, not ESPN's behaviour.
// Record real responses with `dev/smoke.ts games` and swap them in.
const nflDay = gamesScoreboardSchema.parse(handBuiltNflDay).events;
const cfbSchedule = gamesTeamScheduleSchema.parse(handBuiltCfbSchedule).events;

const oct4 = { from: "2026-10-04", to: "2026-10-04" };
const byEvent = (id: string, window = oct4) => {
  const game = gamesFromEvents(nflDay, window).games.find((g) => g.espnEventId === id);
  if (!game) throw new Error(`no game ${id}`);
  return game;
};

describe("mapGameStatus", () => {
  const type = (name: string, state: string, completed: boolean) => ({ name, state, completed });

  it("maps ESPN's states", () => {
    expect(mapGameStatus(type("STATUS_SCHEDULED", "pre", false))).toBe("scheduled");
    expect(mapGameStatus(type("STATUS_IN_PROGRESS", "in", false))).toBe("in_progress");
    expect(mapGameStatus(type("STATUS_HALFTIME", "in", false))).toBe("in_progress");
    expect(mapGameStatus(type("STATUS_FINAL", "post", true))).toBe("final");
    expect(mapGameStatus(type("STATUS_FINAL_OT", "post", true))).toBe("final");
  });

  it("reads the name before the state, because postponed and canceled games are 'post'", () => {
    expect(mapGameStatus(type("STATUS_POSTPONED", "post", false))).toBe("postponed");
    expect(mapGameStatus(type("STATUS_CANCELED", "post", false))).toBe("canceled");
    expect(mapGameStatus(type("STATUS_CANCELLED", "post", false))).toBe("canceled");
  });

  it("treats a delay or suspension as the game being on", () => {
    expect(mapGameStatus(type("STATUS_RAIN_DELAY", "in", false))).toBe("in_progress");
    expect(mapGameStatus(type("STATUS_SUSPENDED", "post", false))).toBe("in_progress");
  });

  it("falls back to `completed` when there is no state, and never invents a result", () => {
    expect(mapGameStatus({ completed: true })).toBe("final");
    expect(mapGameStatus({})).toBe("scheduled");
    expect(mapGameStatus({ state: "post", completed: false })).toBe("postponed");
  });
});

describe("gameFromEvent (hand-built NFL day)", () => {
  it("maps a finished overtime game with ESPN's winner flags and string scores", () => {
    expect(byEvent("900000001")).toEqual({
      espnEventId: "900000001",
      startsAt: new Date("2026-10-04T17:00:00Z"),
      timeTbd: false,
      status: "final",
      statusDetail: "Final/OT",
      note: null,
      neutralSite: false,
      home: {
        espnTeamId: "23",
        name: "Pittsburgh Steelers",
        shortName: "PIT",
        score: 27,
        winner: true,
      },
      away: {
        espnTeamId: "4",
        name: "Cincinnati Bengals",
        shortName: "CIN",
        score: 24,
        winner: false,
      },
    });
  });

  it("reads a live game's scores whether ESPN sends a number or a {value, displayValue} object", () => {
    const live = byEvent("900000002");
    expect(live).toMatchObject({ status: "in_progress", statusDetail: "Q3 4:12" });
    expect([live.home.score, live.away.score]).toEqual([17, 20]);
    // Nobody has won yet, so the flags ESPN sends (false) are not results.
    expect([live.home.winner, live.away.winner]).toEqual([null, null]);
  });

  it("drops the placeholder 0-0 and winner=false ESPN sends before kickoff, and keeps the headline", () => {
    const upcoming = byEvent("900000003");
    expect(upcoming.status).toBe("scheduled");
    expect(upcoming.statusDetail).toBeNull();
    expect([upcoming.home.score, upcoming.away.score]).toEqual([null, null]);
    expect([upcoming.home.winner, upcoming.away.winner]).toEqual([null, null]);
    expect(upcoming.note).toBe("Sunday Night Football");
  });

  it("keeps the Sunday-night game on Sunday: 00:20 UTC Monday is 8:20 pm Eastern Oct 4", () => {
    expect(byEvent("900000003").startsAt.toISOString()).toBe("2026-10-05T00:20:00.000Z");
    expect(gamesFromEvents(nflDay, { from: "2026-10-05", to: "2026-10-05" }).games).toEqual([]);
  });

  it("maps a postponed game with no scores", () => {
    const postponed = byEvent("900000004");
    expect(postponed).toMatchObject({ status: "postponed", statusDetail: "Postponed" });
    expect(postponed.home).toMatchObject({ score: null, shortName: "NYJ" });
  });

  it("builds a name when ESPN sends only part of one, and never an empty label", () => {
    const [first] = nflDay;
    if (!first) throw new Error("fixture is empty");
    const sparse = {
      ...first,
      competitions: first.competitions.map((c) => ({
        ...c,
        competitors: c.competitors.map((t) =>
          t.homeAway === "home"
            ? { ...t, team: { id: "23", location: "Pittsburgh", name: "Steelers" } }
            : { ...t, team: { id: "4" } },
        ),
      })),
    };
    const game = gameFromEvent(sparse);
    expect(game?.home).toMatchObject({
      name: "Pittsburgh Steelers",
      shortName: "Pittsburgh Steelers",
    });
    expect(game?.away).toMatchObject({ name: "4", shortName: "4" });
  });

  it("skips an event without home and away labels and counts it", () => {
    const { games, skipped } = gamesFromEvents(nflDay, oct4);
    expect(skipped).toBe(1);
    expect(games.map((g) => g.espnEventId)).toEqual([
      "900000001",
      "900000002",
      "900000003",
      "900000004",
    ]);
  });

  it("skips an event whose start cannot be read", () => {
    const [first] = nflDay;
    if (!first) throw new Error("fixture is empty");
    const broken = {
      ...first,
      date: "soon",
      competitions: first.competitions.map((c) => ({ ...c, date: undefined })),
    };
    expect(gameFromEvent(broken)).toBeNull();
  });

  it("returns each ESPN event once when two days both list it", () => {
    const { games } = gamesFromEvents([...nflDay, ...nflDay], oct4);
    expect(games).toHaveLength(4);
  });
});

describe("gameFromEvent (hand-built college schedule)", () => {
  const window = { from: "2026-10-01", to: "2026-10-31" };
  const { games } = gamesFromEvents(cfbSchedule, window);

  it("keeps only games inside the window", () => {
    expect(games.map((g) => g.espnEventId)).toEqual(["910000002", "910000003"]);
  });

  it("flags a game whose kickoff ESPN has not set, on the Eastern day ESPN's placeholder falls on", () => {
    expect(games[0]).toMatchObject({ timeTbd: true, status: "scheduled", statusDetail: null });
    // 04:00 UTC Oct 10 is midnight Eastern: still Oct 10, not Oct 9.
    expect(
      gamesFromEvents(cfbSchedule, { from: "2026-10-10", to: "2026-10-10" }).games,
    ).toHaveLength(1);
  });

  it("reads home and away from the labels, not the order, and builds names from location and name", () => {
    expect(games[0]?.home).toMatchObject({
      espnTeamId: "2116",
      name: "UCF Knights",
      shortName: "UCF",
    });
    expect(games[0]?.away).toMatchObject({ espnTeamId: "2132", shortName: "CIN" });
  });

  it("carries the neutral-site flag and the headline", () => {
    expect(games[1]).toMatchObject({
      neutralSite: true,
      note: "Neutral Site Classic",
      timeTbd: false,
    });
  });

  it("maps a finished game's object scores", () => {
    const all = gamesFromEvents(cfbSchedule, { from: "2026-09-01", to: "2026-09-30" }).games;
    expect(all[0]).toMatchObject({
      status: "final",
      home: { score: 38, winner: true },
      away: { score: 14, winner: false },
    });
  });
});

describe("fetchScheduledGames: pro scoreboard", () => {
  const request = { window: oct4, espnSeason: 2026 };

  it("makes one scoreboard call per day, starting the day before the window", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse(handBuiltNflDay));
    const result = await fetchScheduledGames("nfl", request, { fetchImpl, sleep: noSleep });

    expect(calls).toEqual([
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261003&limit=1000",
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261004&limit=1000",
    ]);
    expect(result.ok && result.value).toMatchObject({ requests: 2, failedRequests: 0, skipped: 1 });
    // Both days returned the same events; each game is kept once.
    expect(result.ok && result.value.games).toHaveLength(4);
  });

  it("covers a whole week plus the day before it with 8 calls (one more than days)", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({ events: [] }));
    await fetchScheduledGames(
      "nhl",
      { window: { from: "2026-10-05", to: "2026-10-11" }, espnSeason: 2026 },
      { fetchImpl, sleep: noSleep },
    );
    expect(calls).toHaveLength(8);
    expect(calls[0]).toContain("/hockey/nhl/scoreboard?dates=20261004");
    expect(calls[7]).toContain("dates=20261011");
  });

  it("keeps the games it got when one day fails, and reports the failure", async () => {
    const { fetchImpl } = scriptedFetch((url) =>
      url.includes("dates=20261003") ? jsonResponse({}, 500) : jsonResponse(handBuiltNflDay),
    );
    const result = await fetchScheduledGames("nfl", request, { fetchImpl, sleep: noSleep });
    expect(result.ok && result.value.failedRequests).toBe(1);
    expect(result.ok && result.value.games.length).toBeGreaterThan(0);
  });

  it("fails when every call fails, so the caller can tell an outage from an empty day", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse({}, 503));
    const result = await fetchScheduledGames("nfl", request, { fetchImpl, sleep: noSleep });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_http" } });
  });

  it("fails with espn_shape when an event loses its id", async () => {
    const { fetchImpl } = scriptedFetch(() =>
      jsonResponse({ events: [{ date: "2026-10-04T17:00Z", competitions: [] }] }),
    );
    const result = await fetchScheduledGames("nfl", request, { fetchImpl, sleep: noSleep });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_shape" } });
  });
});

describe("fetchScheduledGames: college team schedules", () => {
  const request = { window: { from: "2026-10-01", to: "2026-10-31" }, espnSeason: 2026 };

  it("asks for each held team once and keeps a game both teams report once", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse(handBuiltCfbSchedule));
    const result = await fetchScheduledGames(
      "ncaaf",
      { ...request, espnTeamIds: ["2132", "2116", "2132"] },
      { fetchImpl, sleep: noSleep },
    );
    expect(calls.sort()).toEqual([
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/2116/schedule?season=2026",
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/2132/schedule?season=2026",
    ]);
    expect(result.ok && result.value.games.map((g) => g.espnEventId)).toEqual([
      "910000002",
      "910000003",
    ]);
  });

  it("refuses a league-wide college fetch instead of hammering ESPN", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}));
    for (const espnTeamIds of [undefined, []]) {
      const result = await fetchScheduledGames("ncaab", { ...request, espnTeamIds }, { fetchImpl });
      expect(result).toMatchObject({ ok: false, error: { code: "espn_unsupported" } });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("fetchScheduledGames: sports without games", () => {
  it("refuses golf and tennis, which are tournaments", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}));
    for (const sport of ["pga", "wta"] as const) {
      const result = await fetchScheduledGames(
        sport,
        { window: oct4, espnSeason: 2026 },
        { fetchImpl },
      );
      expect(result).toMatchObject({ ok: false, error: { code: "espn_unsupported" } });
    }
    expect(calls).toHaveLength(0);
  });
});
