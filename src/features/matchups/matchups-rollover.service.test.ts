import { describe, expect, it, vi } from "vitest";
import type { LeaguePost } from "@/domain/feed";
import type { LeagueData } from "@/domain/league";
import { leagueData, wins } from "@/domain/league/fixtures";
import { matchup } from "@/domain/matchups/fixtures";
import type { Matchup, MatchupError, RecentPair } from "@/domain/matchups";
import type { RollWeekInput, RollWeekSummary } from "@/data/matchups.repository";
import type { Logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import {
  createMatchupsRolloverService,
  type RolloverDeps,
  type RolloverReport,
} from "./matchups-rollover.service";

// Mon Oct 5 2026 06:45 EDT: the on-time firing. Season: 2026-08-27 .. 2027-11-15.
const MONDAY = new Date("2026-10-05T10:45:00Z");
const MONDAY_EARLY = new Date("2026-10-05T10:00:00Z"); // 06:00 EDT, before the cutoff
const THURSDAY = new Date("2026-10-08T14:00:00Z");

/** Teams a, b, c, d rank in that order: 3, 2, 1 and 0 wins at 2 points each. */
const four = (): LeagueData =>
  leagueData({
    teams: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    results: [wins("a-nfl", 3), wins("b-nfl", 2), wins("c-nfl", 1)],
  });
const TOTALS = { a: 6, b: 4, c: 2, d: 0 };

const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silent,
};

const SUMMARY: RollWeekSummary = { rolled: true, finalized: 0, created: 2 };

type Setup = {
  data?: LeagueData | null;
  existing?: Matchup[];
  recent?: RecentPair[];
  rolled?: Result<RollWeekSummary, MatchupError>;
  postFails?: boolean;
};

function setup(options: Setup = {}) {
  const data = options.data === undefined ? four() : options.data;
  const posts: LeaguePost[] = [];
  const rollWeek = vi.fn<(input: RollWeekInput) => Promise<Result<RollWeekSummary, MatchupError>>>(
    async () => options.rolled ?? ok(SUMMARY),
  );
  const listSeason = vi.fn<(seasonId: string) => Promise<Matchup[]>>(
    async () => options.existing ?? [],
  );
  const listRecentPairs = vi.fn<
    (seasonId: string, beforeWeekStart: string, weeks: number) => Promise<RecentPair[]>
  >(async () => options.recent ?? []);
  const loadFresh = vi.fn(async () => data);
  const write = vi.fn(async (_seasonId: string, post: LeaguePost) => {
    if (options.postFails) throw new Error("posts are down");
    posts.push(post);
  });
  const revalidate = vi.fn();
  const invalidateLeague = vi.fn();
  const error = vi.fn();
  const warn = vi.fn();
  const deps: RolloverDeps = {
    league: { loadFresh },
    matchups: { listSeason, listRecentPairs, rollWeek },
    posts: { write },
    revalidate,
    invalidateLeague,
    logger: {
      ...silent,
      warn,
      error,
      child: () => ({ ...silent, warn, error }),
    },
    newCorrelationId: () => "corr-1",
  };
  return {
    service: createMatchupsRolloverService(deps),
    loadFresh,
    listSeason,
    listRecentPairs,
    rollWeek,
    write,
    posts,
    revalidate,
    invalidateLeague,
    error,
    warn,
  };
}

/** The report of a run that is expected to answer with a value, not a typed error. */
async function report(s: ReturnType<typeof setup>, now: Date): Promise<RolloverReport> {
  const result = await s.service.rollWeek({ now });
  if (!result.ok) throw new Error(`expected a report, got ${result.error.code}`);
  return result.value;
}

const skipReason = (r: RolloverReport) => (r.status === "skipped" ? r.reason : r.status);

describe("rollWeek: when it does nothing", () => {
  it("skips before Monday 06:30 Eastern without touching the database", async () => {
    const s = setup();
    expect(await report(s, MONDAY_EARLY)).toMatchObject({
      status: "skipped",
      reason: "not_due",
      weekStart: "2026-10-05",
    });
    expect(s.loadFresh).not.toHaveBeenCalled();
    expect(s.rollWeek).not.toHaveBeenCalled();
    expect(s.revalidate).not.toHaveBeenCalled();
  });

  it("skips when there is no active season", async () => {
    const s = setup({ data: null });
    expect(skipReason(await report(s, MONDAY))).toBe("no_season");
    expect(s.rollWeek).not.toHaveBeenCalled();
  });

  it("skips a week before the season's first", async () => {
    const s = setup();
    // Tue Aug 18 2026: the season's first week starts Aug 24.
    expect(skipReason(await report(s, new Date("2026-08-18T14:00:00Z")))).toBe("outside_season");
    expect(s.rollWeek).not.toHaveBeenCalled();
  });

  it("waits for a Monday when the season has no matchups yet (no partial first week)", async () => {
    const s = setup({ existing: [] });
    expect(await report(s, THURSDAY)).toMatchObject({
      status: "skipped",
      reason: "waiting_for_monday",
    });
    expect(s.rollWeek).not.toHaveBeenCalled();
    expect(s.revalidate).not.toHaveBeenCalled();
  });

  it("opens the first week on a Monday", async () => {
    const s = setup({ existing: [] });
    expect(await report(s, MONDAY)).toMatchObject({ status: "done", action: "pair", created: 2 });
  });

  it("catches up on a later weekday once the season has matchups", async () => {
    // The Monday run died; last week's matchups are still open.
    const open = matchup("2026-09-28", "a", "b");
    const s = setup({ existing: [open], rolled: ok({ rolled: true, finalized: 1, created: 2 }) });
    expect(await report(s, THURSDAY)).toMatchObject({
      status: "done",
      weekStart: "2026-10-05",
      finalized: 1,
    });
    expect(s.rollWeek).toHaveBeenCalledOnce();
  });

  it("closes nothing after the season when nothing is open, and never calls the rpc", async () => {
    const closedWeek = matchup("2027-11-15", "a", "b", { end: [6, 4] });
    const s = setup({ existing: [closedWeek] });
    // Tue Nov 23 2027: the week of Nov 22 is after the season's last week.
    expect(await report(s, new Date("2027-11-23T15:00:00Z"))).toMatchObject({
      status: "skipped",
      reason: "nothing_open",
    });
    expect(s.rollWeek).not.toHaveBeenCalled();
    expect(s.revalidate).not.toHaveBeenCalled();
  });
});

describe("rollWeek: the pair path", () => {
  it("pairs by standings, closes with every team's total and freezes the same totals as starts", async () => {
    const s = setup();
    expect(await report(s, MONDAY)).toMatchObject({
      status: "done",
      action: "pair",
      weekStart: "2026-10-05",
      byeTeamId: null,
      correlationId: "corr-1",
    });

    expect(s.rollWeek).toHaveBeenCalledOnce();
    const input = s.rollWeek.mock.calls[0]?.[0];
    expect(input?.seasonId).toBe("s1");
    expect(input?.weekStart).toBe("2026-10-05");
    // Finals for every team, not just those with an open matchup.
    expect(input?.finals).toEqual([
      { teamId: "a", points: TOTALS.a },
      { teamId: "b", points: TOTALS.b },
      { teamId: "c", points: TOTALS.c },
      { teamId: "d", points: TOTALS.d },
    ]);
    // a-b, c-d by neighbors, and each start is exactly the total that was also written as a final.
    expect(input?.pairings).toEqual([
      { homeTeamId: "a", awayTeamId: "b", homeStartPoints: TOTALS.a, awayStartPoints: TOTALS.b },
      { homeTeamId: "c", awayTeamId: "d", homeStartPoints: TOTALS.c, awayStartPoints: TOTALS.d },
    ]);
    const finalOf = new Map(input?.finals.map((f) => [f.teamId, f.points]));
    for (const p of input?.pairings ?? []) {
      expect(p.homeStartPoints).toBe(finalOf.get(p.homeTeamId));
      expect(p.awayStartPoints).toBe(finalOf.get(p.awayTeamId));
    }
  });

  it("reads the recent pairs for the rematch window and avoids them", async () => {
    const s = setup({ recent: [["a", "b"]] });
    await report(s, MONDAY);
    expect(s.listRecentPairs).toHaveBeenCalledWith("s1", "2026-10-05", 3);
    const pairs = s.rollWeek.mock.calls[0]?.[0].pairings.map((p) => [p.homeTeamId, p.awayTeamId]);
    // a met b recently, so a takes the next team down and b the one left.
    expect(pairs).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("gives an odd field a bye: logged and reported, with no row for that team", async () => {
    const data = leagueData({
      teams: [{ id: "a" }, { id: "b" }, { id: "c" }],
      results: [wins("a-nfl", 3), wins("b-nfl", 2), wins("c-nfl", 1)],
    });
    const s = setup({ data });
    const r = await report(s, MONDAY);
    expect(r).toMatchObject({ status: "done", byeTeamId: "c" });
    const input = s.rollWeek.mock.calls[0]?.[0];
    expect(input?.pairings).toHaveLength(1);
    expect(input?.finals.map((f) => f.teamId)).toContain("c");
    expect(input?.pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId]).includes("c")).toBe(false);
  });
});

describe("rollWeek: the close-only path", () => {
  it("sends empty pairings, closes the open week and posts only the results", async () => {
    const open = matchup("2027-11-15", "a", "b", { start: [0, 0] });
    const s = setup({
      existing: [open],
      rolled: ok({ rolled: true, finalized: 1, created: 0 }),
    });
    const r = await report(s, new Date("2027-11-23T15:00:00Z"));
    expect(r).toMatchObject({
      status: "done",
      action: "close_only",
      weekStart: "2027-11-22",
      finalized: 1,
      created: 0,
    });
    const input = s.rollWeek.mock.calls[0]?.[0];
    expect(input?.pairings).toEqual([]);
    expect(input?.finals).toHaveLength(4);
    // No pairing lookup is needed when nothing opens.
    expect(s.listRecentPairs).not.toHaveBeenCalled();
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]?.payload).toMatchObject({
      type: "matchups_week",
      weekStart: "2027-11-22",
      pairings: [],
    });
    expect(s.posts[0]?.body).toBe("Last week: a beat b 6 to 4.");
  });
});

describe("rollWeek: a repeat", () => {
  it("reports already_rolled, writes no post, and still drops the cache", async () => {
    const s = setup({
      existing: [matchup("2026-10-05", "a", "b")],
      rolled: ok({ rolled: false, finalized: 0, created: 0 }),
    });
    expect(await report(s, THURSDAY)).toMatchObject({
      status: "skipped",
      reason: "already_rolled",
    });
    expect(s.rollWeek).toHaveBeenCalledOnce();
    expect(s.write).not.toHaveBeenCalled();
    // A cheap belt-and-braces drop: it also covers a run that died between its commit and its own
    // invalidation. The league cache is not touched: repeats fire daily and must not churn it.
    expect(s.revalidate).toHaveBeenCalledOnce();
    expect(s.invalidateLeague).not.toHaveBeenCalled();
  });

  it("drops the matchups cache and the league cache when it rolled", async () => {
    const s = setup();
    await report(s, MONDAY);
    expect(s.revalidate).toHaveBeenCalledOnce();
    // Pages must not compute live gains from totals older than the ones just frozen as starts.
    expect(s.invalidateLeague).toHaveBeenCalledOnce();
  });
});

describe("rollWeek: the feed post", () => {
  it("scores last week from the frozen starts and the totals just written", async () => {
    // Week of Sep 28 was open with a and b (b started ahead), c and d tied at 0 start.
    const existing = [
      matchup("2026-09-28", "a", "b", { start: [1, 3] }),
      matchup("2026-09-28", "c", "d", { start: [2, 0] }),
    ];
    const s = setup({
      existing,
      rolled: ok({ rolled: true, finalized: 2, created: 2 }),
    });
    await report(s, MONDAY);

    // Gains: a 6-1 = 5 vs b 4-3 = 1; c 2-2 = 0 vs d 0-0 = 0, a tie.
    expect(s.posts).toHaveLength(1);
    const post = s.posts[0];
    expect(post?.body).toBe(
      "Last week: a beat b 5 to 1, c and d tied at 0. This week: a vs b, c vs d.",
    );
    expect(post?.payload).toMatchObject({
      type: "matchups_week",
      weekStart: "2026-10-05",
      results: [
        { home: { slug: "a" }, away: { slug: "b" }, homeGain: 5, awayGain: 1, outcome: "home" },
        { home: { slug: "c" }, away: { slug: "d" }, homeGain: 0, awayGain: 0, outcome: "tie" },
      ],
    });
  });

  it("maps an away win to the feed's outcome", async () => {
    const s = setup({
      existing: [matchup("2026-09-28", "d", "a", { start: [0, 0] })],
      rolled: ok({ rolled: true, finalized: 1, created: 2 }),
    });
    await report(s, MONDAY);
    expect(s.posts[0]?.payload).toMatchObject({
      results: [{ home: { slug: "d" }, away: { slug: "a" }, outcome: "away" }],
    });
  });

  it("writes the first week's post with pairings only", async () => {
    const s = setup({ existing: [] });
    await report(s, MONDAY);
    expect(s.posts[0]?.body).toBe("This week: a vs b, c vs d.");
    expect(s.posts[0]?.payload).toMatchObject({ results: [] });
  });

  it("does not fail the rollover when the post cannot be written", async () => {
    const s = setup({ postFails: true });
    const r = await report(s, MONDAY);
    expect(r).toMatchObject({ status: "done", created: 2, post: "failed" });
    expect(s.error).toHaveBeenCalledWith("matchups week post failed", expect.anything());
    expect(s.revalidate).toHaveBeenCalledOnce();
  });
});

describe("rollWeek: failures", () => {
  it("returns the database function's typed error as a value, with the correlation id, no post and no cache drop", async () => {
    const error: MatchupError = {
      code: "week_out_of_order",
      message: "A later week already has matchups, so an earlier one cannot be added.",
    };
    const s = setup({ rolled: err(error.code, error.message) });
    const result = await s.service.rollWeek({ now: MONDAY });
    expect(result).toEqual({ ok: false, error: { ...error, correlationId: "corr-1" } });
    expect(s.write).not.toHaveBeenCalled();
    expect(s.revalidate).not.toHaveBeenCalled();
    expect(s.invalidateLeague).not.toHaveBeenCalled();
  });

  it.each([
    ["week_out_of_order", "warn"],
    ["season_not_found", "warn"],
    ["missing_final", "error"],
    ["invalid_finals", "error"],
    ["invalid_pairings", "error"],
    ["duplicate_team", "error"],
    ["invalid_week_start", "error"],
  ] as const)("logs %s at %s level", async (code, level) => {
    const s = setup({ rolled: err(code, code) });
    await s.service.rollWeek({ now: MONDAY });
    const loud = level === "error" ? s.error : s.warn;
    const quiet = level === "error" ? s.warn : s.error;
    expect(loud).toHaveBeenCalledWith(
      "matchups rollover refused",
      expect.objectContaining({ code }),
    );
    expect(quiet).not.toHaveBeenCalled();
  });

  it("lets an unexpected failure throw for the route to log", async () => {
    const s = setup();
    s.rollWeek.mockRejectedValueOnce(new Error("connection reset"));
    await expect(s.service.rollWeek({ now: MONDAY })).rejects.toThrow("connection reset");
    expect(s.write).not.toHaveBeenCalled();
  });
});
