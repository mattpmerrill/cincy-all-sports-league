import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/domain/league";
import { leagueData, wins } from "@/domain/league/fixtures";
import type { Matchup } from "@/domain/matchups";
import { matchup } from "@/domain/matchups/fixtures";
import { createMatchupsService } from "./matchups.service";

const owner = (id: string) => ({ id, displayName: `Owner ${id}`, avatarUrl: null });

// Wed Oct 7 2026, noon Eastern: the current league week starts Mon Oct 5. Season 2026-08-27 .. 2027-11-15.
const now = new Date("2026-10-07T16:00:00Z");

/** Totals: a 6, b 4, c 2, d 0, so the season ranks are a, b, c, d. The viewer "u3" owns c. */
const four = (): LeagueData =>
  leagueData({
    teams: [
      { id: "a", owner: owner("u1") },
      { id: "b", owner: owner("u2") },
      { id: "c", owner: owner("u3") },
      { id: "d" },
    ],
    results: [wins("a-nfl", 3), wins("b-nfl", 2), wins("c-nfl", 1)],
  });

function setup(matchups: Matchup[], data: LeagueData | null = four(), at: Date = now) {
  const source = vi.fn<(seasonId: string) => Promise<Matchup[]>>(async () => matchups);
  const service = createMatchupsService({
    league: async () => data,
    matchups: source,
    now: () => at,
  });
  return { service, source };
}

describe("without a season", () => {
  it("returns null for every read and no records", async () => {
    const { service } = setup([], null);
    expect(await service.getWeekMatchups({})).toBeNull();
    expect(await service.getMatchupStandings()).toBeNull();
    expect(await service.getTeamMatchups({ teamSlug: "a" })).toBeNull();
    expect((await service.getMatchupRecords()).recordFor("a")).toBeNull();
  });
});

describe("getWeekMatchups", () => {
  // Starts a 0, b 3, c 2, d 1: live gains a 6, b 1, c 0, d -1.
  const live = [
    matchup("2026-10-05", "a", "b", { start: [0, 3] }),
    matchup("2026-10-05", "c", "d", { start: [2, 1] }),
  ];

  it("scores live matchups against the current totals and adds names, ranks and owners", async () => {
    const week = await setup(live).service.getWeekMatchups({});
    expect(week).toMatchObject({
      seasonName: "2026-27",
      weekStart: "2026-10-05",
      rangeLabel: "Oct 5 – 11, 2026",
      isCurrentWeek: true,
      byeTeams: [],
      empty: null,
    });
    expect(week?.matchups).toHaveLength(2);
    expect(week?.matchups[0]).toMatchObject({
      state: "live",
      leader: "home",
      home: { slug: "a", name: "a", ownerName: "Owner u1", seasonRank: 1, gain: 6, result: null },
      away: { slug: "b", seasonRank: 2, seasonRankLabel: "2", gain: 1 },
    });
    expect(week?.matchups[1]).toMatchObject({
      leader: "home",
      home: { slug: "c", gain: 0 },
      away: { slug: "d", ownerName: null, gain: -1 },
    });
  });

  it("puts the viewer's matchup first, and flags their side", async () => {
    const week = await setup(live).service.getWeekMatchups({ viewerId: "u3" });
    expect(week?.matchups.map((m) => [m.home.slug, m.isMine])).toEqual([
      ["c", true],
      ["a", false],
    ]);
    expect(week?.matchups[0]?.home.isMine).toBe(true);
    expect(week?.matchups[0]?.away.isMine).toBe(false);
  });

  it("orders everyone equally by season rank when signed out or the viewer has no team", async () => {
    for (const viewerId of [undefined, null, "someone-else"]) {
      const week = await setup(live).service.getWeekMatchups({ viewerId });
      expect(week?.matchups.map((m) => m.home.slug)).toEqual(["a", "c"]);
      expect(week?.matchups.some((m) => m.isMine)).toBe(false);
    }
  });

  it("shows a finished week from its frozen totals, whatever the totals are now", async () => {
    // Frozen at the close: a gained 2 over b's 5. Today's totals (a 6, b 4) say the opposite.
    const closed = [matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] })];
    const week = await setup(closed).service.getWeekMatchups({ weekStart: "2026-09-28" });
    expect(week?.isCurrentWeek).toBe(false);
    expect(week?.matchups[0]).toMatchObject({
      state: "final",
      leader: "away",
      home: { gain: 2, result: "loss" },
      away: { gain: 5, result: "win" },
    });
  });

  it("carries each team's matchup record, null until a week has finished", async () => {
    const before = await setup(live).service.getWeekMatchups({});
    expect(before?.matchups[0]?.home.record).toBeNull();

    const after = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] }),
      matchup("2026-09-28", "c", "d", { start: [0, 0], end: [1, 1] }),
      ...live,
    ]).service.getWeekMatchups({});
    const [ab, cd] = after?.matchups ?? [];
    expect(ab?.home.record).toEqual({ wins: 0, losses: 1, ties: 0, label: "0-1-0" });
    expect(ab?.away.record).toEqual({ wins: 1, losses: 0, ties: 0, label: "1-0-0" });
    expect(cd?.home.record?.label).toBe("0-0-1");
  });

  it("lists the team left without a matchup", async () => {
    const week = await setup([matchup("2026-10-05", "a", "b")]).service.getWeekMatchups({});
    expect(week?.byeTeams.map((t) => t.slug)).toEqual(["c", "d"]);
  });

  describe("empty states", () => {
    it("says matchups start Monday when the season has none yet", async () => {
      const week = await setup([]).service.getWeekMatchups({});
      expect(week).toMatchObject({ matchups: [], byeTeams: [], empty: "starts_monday" });
    });

    it("says none this week when the season has matchups for other weeks only", async () => {
      const week = await setup([
        matchup("2026-09-28", "a", "b", { end: [1, 0] }),
      ]).service.getWeekMatchups({});
      expect(week).toMatchObject({
        weekStart: "2026-10-05",
        matchups: [],
        empty: "none_this_week",
      });
    });
  });

  it("pulls a week outside the season to the nearest week the season covers", async () => {
    const { service } = setup([]);
    expect((await service.getWeekMatchups({ weekStart: "2020-01-06" }))?.weekStart).toBe(
      "2026-08-24",
    );
    expect((await service.getWeekMatchups({ weekStart: "2031-01-06" }))?.weekStart).toBe(
      "2027-11-15",
    );
  });

  it("skips a matchup whose team is no longer in the league", async () => {
    const week = await setup([matchup("2026-10-05", "a", "gone")]).service.getWeekMatchups({});
    expect(week?.matchups).toEqual([]);
  });
});

describe("the week shown while the Monday rollover is pending", () => {
  // Last week (Oct 5) is still live; the current calendar week is Oct 12.
  const lastWeek = [
    matchup("2026-10-05", "a", "b", { start: [0, 3] }),
    matchup("2026-10-05", "c", "d", { start: [2, 1] }),
  ];
  const earlyMonday = new Date("2026-10-12T09:00:00Z"); // 05:00 EDT, before the 06:45 rollover
  const missedMonday = new Date("2026-10-13T16:00:00Z"); // Tuesday noon, the job never ran

  it.each([
    ["early Monday", earlyMonday],
    ["a missed Monday (Tuesday)", missedMonday],
  ])("keeps showing last week's live matchups on %s", async (_label, at) => {
    const week = await setup(lastWeek, four(), at).service.getWeekMatchups({});
    expect(week).toMatchObject({
      weekStart: "2026-10-05",
      rangeLabel: "Oct 5 – 11, 2026",
      isCurrentWeek: true,
      awaitingRollover: true,
      empty: null,
    });
    expect(week?.matchups).toHaveLength(2);
    expect(week?.matchups[0]?.state).toBe("live");
  });

  it("shows the current week as itself once it has rows, whatever else is open", async () => {
    const week = await setup(
      [...lastWeek, matchup("2026-10-12", "a", "c")],
      four(),
      missedMonday,
    ).service.getWeekMatchups({});
    expect(week).toMatchObject({ weekStart: "2026-10-12", awaitingRollover: false });
    expect(week?.matchups).toHaveLength(1);
  });

  it("is a plain current week on a normal day", async () => {
    const week = await setup([matchup("2026-10-05", "a", "b")]).service.getWeekMatchups({});
    expect(week).toMatchObject({
      weekStart: "2026-10-05",
      isCurrentWeek: true,
      awaitingRollover: false,
    });
  });

  it("honours an explicitly requested past week as asked", async () => {
    const week = await setup(lastWeek, four(), earlyMonday).service.getWeekMatchups({
      weekStart: "2026-09-28",
    });
    expect(week).toMatchObject({
      weekStart: "2026-09-28",
      isCurrentWeek: false,
      awaitingRollover: false,
      empty: "none_this_week",
    });
    // Asking for last week by name is not the stand-in: it is just that week.
    const named = await setup(lastWeek, four(), earlyMonday).service.getWeekMatchups({
      weekStart: "2026-10-05",
    });
    expect(named).toMatchObject({
      weekStart: "2026-10-05",
      isCurrentWeek: false,
      awaitingRollover: false,
    });
    expect(named?.matchups).toHaveLength(2);
  });

  it("is genuinely empty when the earlier weeks are all final", async () => {
    const week = await setup(
      [matchup("2026-10-05", "a", "b", { end: [1, 0] })],
      four(),
      missedMonday,
    ).service.getWeekMatchups({});
    expect(week).toMatchObject({
      weekStart: "2026-10-12",
      awaitingRollover: false,
      empty: "none_this_week",
    });
  });

  it("still says matchups start Monday for a season with none", async () => {
    const week = await setup([], four(), earlyMonday).service.getWeekMatchups({});
    expect(week).toMatchObject({ awaitingRollover: false, empty: "starts_monday" });
  });

  it("gives the matchup table the same live week, so opponents are shown", async () => {
    const standings = await setup(lastWeek, four(), earlyMonday).service.getMatchupStandings();
    expect(standings?.liveWeekStart).toBe("2026-10-05");
    expect(standings?.rows.find((r) => r.slug === "a")?.opponent?.slug).toBe("b");
  });
});

describe("getMatchupStandings", () => {
  it("flags that no week has finished, so the page shows an empty state", async () => {
    const standings = await setup([
      matchup("2026-10-05", "a", "b", { start: [0, 0] }),
    ]).service.getMatchupStandings();
    expect(standings).toMatchObject({ hasFinishedWeek: false, liveWeekStart: "2026-10-05" });
    expect(standings?.rows).toHaveLength(4);
  });

  it("ranks by record and names this week's opponent", async () => {
    const standings = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [1, 5] }), // b wins
      matchup("2026-09-28", "c", "d", { start: [0, 0], end: [4, 2] }), // c wins
      matchup("2026-10-05", "a", "c", { start: [1, 4] }),
      matchup("2026-10-05", "b", "d", { start: [5, 2] }),
    ]).service.getMatchupStandings({ viewerId: "u3" });

    expect(standings?.hasFinishedWeek).toBe(true);
    expect(
      standings?.rows.map((r) => [r.slug, r.record.label, r.rankLabel, r.pointsGained]),
    ).toEqual([
      ["b", "1-0-0", "1", 5],
      ["c", "1-0-0", "2", 4],
      ["d", "0-1-0", "3", 2],
      ["a", "0-1-0", "4", 1],
    ]);
    const b = standings?.rows.find((r) => r.slug === "b");
    expect(b).toMatchObject({
      streak: { label: "W1", length: 1 },
      opponent: { slug: "d", name: "d" },
      seasonRank: 2,
      ownerName: "Owner u2",
      isMine: false,
    });
    expect(standings?.rows.find((r) => r.slug === "c")?.isMine).toBe(true);
  });

  it("has no opponent for a team on a bye", async () => {
    const standings = await setup([matchup("2026-10-05", "a", "b")]).service.getMatchupStandings();
    expect(standings?.rows.find((r) => r.slug === "d")?.opponent).toBeNull();
    expect(standings?.rows.find((r) => r.slug === "a")?.opponent?.slug).toBe("b");
  });
});

describe("getTeamMatchups", () => {
  const season = [
    matchup("2026-09-21", "b", "a", { start: [0, 0], end: [3, 1] }), // a is away and loses
    matchup("2026-09-28", "a", "c", { start: [0, 0], end: [2, 2] }), // tie
    matchup("2026-10-05", "a", "d", { start: [1, 1] }), // live: a 6-1 = 5 ahead of d -1
    matchup("2026-10-05", "b", "c", { start: [0, 0] }),
  ];

  it("is null for an unknown team", async () => {
    expect(await setup(season).service.getTeamMatchups({ teamSlug: "nobody" })).toBeNull();
  });

  it("lists the team's weeks newest first from the team's own side", async () => {
    const team = await setup(season).service.getTeamMatchups({ teamSlug: "a" });
    expect(team).toMatchObject({
      slug: "a",
      name: "a",
      ownerName: "Owner u1",
      seasonRank: 1,
      record: { wins: 0, losses: 1, ties: 1, label: "0-1-1" },
      streak: { label: "T1", length: 1 },
    });
    expect(team?.entries.map((e) => e.weekStart)).toEqual([
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
    ]);
    expect(team?.entries[0]).toMatchObject({
      side: "home",
      opponent: { slug: "d", ownerName: null },
      gain: 5,
      opponentGain: -1,
      status: { state: "live", lead: "ahead" },
    });
    expect(team?.entries[1]).toMatchObject({
      gain: 2,
      opponentGain: 2,
      status: { state: "final", result: "tie" },
    });
    expect(team?.entries[2]).toMatchObject({
      side: "away",
      opponent: { slug: "b" },
      gain: 1,
      opponentGain: 3,
      status: { state: "final", result: "loss" },
    });
  });

  it("reads the live lead from the team's side, including behind and level", async () => {
    // d trails a in the live week; the same matchup from d's side is "behind".
    const d = await setup(season).service.getTeamMatchups({ teamSlug: "d" });
    expect(d?.entries[0]?.status).toEqual({ state: "live", lead: "behind" });
    // Starts 3 and 1 against totals 6 and 4: both gained 3.
    const level = await setup([
      matchup("2026-10-05", "a", "b", { start: [3, 1] }),
    ]).service.getTeamMatchups({ teamSlug: "b" });
    expect(level?.entries[0]?.status).toEqual({ state: "live", lead: "tied" });
  });

  it("has no record or streak before any week has finished", async () => {
    const team = await setup([matchup("2026-10-05", "a", "b")]).service.getTeamMatchups({
      teamSlug: "a",
    });
    expect(team?.record).toBeNull();
    expect(team?.streak).toBeNull();
    expect(team?.entries).toHaveLength(1);
  });
});

describe("getMatchupRecords", () => {
  it("answers every team from one read of each source", async () => {
    const { service, source } = setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [3, 1] }),
    ]);
    const records = await service.getMatchupRecords();
    expect(records.recordFor("a")?.label).toBe("1-0-0");
    expect(records.recordFor("b")?.label).toBe("0-1-0");
    expect(records.recordFor("c")?.label).toBe("0-0-0");
    expect(records.recordFor("unknown")).toBeNull();
    expect(source).toHaveBeenCalledOnce();
  });

  it("draws nothing before a week has finished", async () => {
    const records = await setup([matchup("2026-10-05", "a", "b")]).service.getMatchupRecords();
    expect(records.recordFor("a")).toBeNull();
  });
});
