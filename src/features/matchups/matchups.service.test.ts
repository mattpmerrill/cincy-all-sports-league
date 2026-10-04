import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/domain/league";
import { leagueData, wins } from "@/domain/league/fixtures";
import type { Matchup } from "@/domain/matchups";
import { matchup } from "@/domain/matchups/fixtures";
import { createMatchupsService } from "./matchups.service";
import type { MatchupView, WeekMatchups } from "./matchups.service";

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

/** Every matchup of a week, the viewer's first (the pages ask for `mine` and `others`, not this). */
const everyone = (week: WeekMatchups | null | undefined): MatchupView[] =>
  week ? [...(week.mine ? [week.mine] : []), ...week.others] : [];

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
    expect(everyone(week)).toHaveLength(2);
    expect(everyone(week)[0]).toMatchObject({
      state: "live",
      leader: "home",
      home: { slug: "a", name: "a", ownerName: "Owner u1", seasonRank: 1, gain: 6, result: null },
      away: { slug: "b", seasonRank: 2, seasonRankLabel: "2", gain: 1 },
    });
    expect(everyone(week)[1]).toMatchObject({
      leader: "home",
      home: { slug: "c", gain: 0 },
      away: { slug: "d", ownerName: null, gain: -1 },
    });
  });

  it("gives each side its lead while live and its result once final, never both", async () => {
    const live1 = everyone(await setup(live).service.getWeekMatchups({}))[0];
    expect([live1?.home.lead, live1?.away.lead]).toEqual(["ahead", "behind"]);
    expect([live1?.home.result, live1?.away.result]).toEqual([null, null]);
    const closed = [matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] })];
    const done = everyone(
      await setup(closed).service.getWeekMatchups({ weekStart: "2026-09-28" }),
    )[0];
    expect([done?.home.lead, done?.away.lead]).toEqual([null, null]);
    // b gained 5 to a's 2, so the away side won.
    expect([done?.home.result, done?.away.result]).toEqual(["loss", "win"]);
  });

  it("returns the viewer's matchup as `mine` and everyone else's as `others`", async () => {
    const week = await setup(live).service.getWeekMatchups({ viewerId: "u3" });
    expect(week?.mine).toMatchObject({ home: { slug: "c", isMine: true }, isMine: true });
    expect(week?.mine?.away.isMine).toBe(false);
    expect(week?.others.map((m) => [m.home.slug, m.isMine])).toEqual([["a", false]]);
    // The viewer on the away side finds the same matchup.
    const away = await setup(live).service.getWeekMatchups({ viewerId: "u2" });
    expect(away?.mine).toMatchObject({ home: { slug: "a" }, away: { slug: "b", isMine: true } });
    expect(away?.others.map((m) => m.home.slug)).toEqual(["c"]);
  });

  it("tells the viewer how their own team is doing, and nobody else", async () => {
    // c (viewer) is level with d at 0 vs -1, so ahead; a is the home side of the other matchup.
    const week = await setup(live).service.getWeekMatchups({ viewerId: "u3" });
    expect(week?.mine?.viewerOutcome).toEqual({ state: "live", lead: "ahead" });
    expect(week?.others.map((m) => m.viewerOutcome)).toEqual([null]);
    const away = await setup(live).service.getWeekMatchups({ viewerId: "u2" });
    expect(away?.mine?.viewerOutcome).toEqual({ state: "live", lead: "behind" });
    const none = await setup(live).service.getWeekMatchups({});
    expect(none?.mine).toBeNull();
    expect(none?.others.every((m) => m.viewerOutcome === null)).toBe(true);
  });

  it("gives a finished matchup's result from the viewer's side", async () => {
    const closed = [matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] })];
    const week = await setup(closed).service.getWeekMatchups({
      weekStart: "2026-09-28",
      viewerId: "u1",
    });
    expect(week?.mine?.viewerOutcome).toEqual({ state: "final", result: "loss" });
  });

  it("has no `mine` and orders everyone by season rank when signed out or the viewer has no team", async () => {
    for (const viewerId of [undefined, null, "someone-else"]) {
      const week = await setup(live).service.getWeekMatchups({ viewerId });
      expect(week?.mine).toBeNull();
      expect(week?.others.map((m) => m.home.slug)).toEqual(["a", "c"]);
      expect(week?.others.some((m) => m.isMine)).toBe(false);
    }
  });

  it("shows a finished week from its frozen totals, whatever the totals are now", async () => {
    // Frozen at the close: a gained 2 over b's 5. Today's totals (a 6, b 4) say the opposite.
    const closed = [matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] })];
    const week = await setup(closed).service.getWeekMatchups({ weekStart: "2026-09-28" });
    expect(week?.isCurrentWeek).toBe(false);
    expect(everyone(week)[0]).toMatchObject({
      state: "final",
      leader: "away",
      home: { gain: 2, result: "loss" },
      away: { gain: 5, result: "win" },
    });
  });

  it("carries each team's matchup record, null until a week has finished", async () => {
    const before = await setup(live).service.getWeekMatchups({});
    expect(everyone(before)[0]?.home.record).toBeNull();

    const after = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] }),
      matchup("2026-09-28", "c", "d", { start: [0, 0], end: [1, 1] }),
      ...live,
    ]).service.getWeekMatchups({});
    const [ab, cd] = everyone(after) ?? [];
    expect(ab?.home.record).toEqual({ wins: 0, losses: 1, ties: 0, label: "0-1-0" });
    expect(ab?.away.record).toEqual({ wins: 1, losses: 0, ties: 0, label: "1-0-0" });
    expect(cd?.home.record?.label).toBe("0-0-1");
  });

  it("says whether the sides carry a record, so a page can explain W-L-T", async () => {
    expect((await setup(live).service.getWeekMatchups({}))?.hasRecords).toBe(false);
    const after = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [2, 5] }),
      ...live,
    ]).service.getWeekMatchups({});
    expect(after?.hasRecords).toBe(true);
  });

  it("lists the team left without a matchup", async () => {
    const week = await setup([matchup("2026-10-05", "a", "b")]).service.getWeekMatchups({});
    expect(week?.byeTeams.map((t) => t.slug)).toEqual(["c", "d"]);
  });

  describe("empty states", () => {
    it("says matchups start Monday when the season has none yet", async () => {
      const week = await setup([]).service.getWeekMatchups({});
      expect(week).toMatchObject({
        mine: null,
        others: [],
        byeTeams: [],
        empty: "starts_monday",
      });
    });

    it("says none this week when the season has matchups for other weeks only", async () => {
      const week = await setup([
        matchup("2026-09-28", "a", "b", { end: [1, 0] }),
      ]).service.getWeekMatchups({});
      expect(week).toMatchObject({
        weekStart: "2026-10-05",
        mine: null,
        others: [],
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
    expect(everyone(week)).toEqual([]);
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
    expect(everyone(week)).toHaveLength(2);
    expect(everyone(week)[0]?.state).toBe("live");
  });

  it("shows the current week as itself once it has rows, whatever else is open", async () => {
    const week = await setup(
      [...lastWeek, matchup("2026-10-12", "a", "c")],
      four(),
      missedMonday,
    ).service.getWeekMatchups({});
    expect(week).toMatchObject({ weekStart: "2026-10-12", awaitingRollover: false });
    expect(everyone(week)).toHaveLength(1);
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
    expect(everyone(named)).toHaveLength(2);
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
    // Give the table a finished week so it is drawn; the live week is still Oct 5.
    const standings = await setup(
      [matchup("2026-09-28", "a", "b", { start: [0, 0], end: [1, 0] }), ...lastWeek],
      four(),
      earlyMonday,
    ).service.getMatchupStandings();
    expect(standings).toMatchObject({ state: "table", liveWeekStart: "2026-10-05" });
    const rows = standings?.state === "table" ? standings.rows : [];
    expect(rows.find((r) => r.slug === "a")?.opponent?.slug).toBe("b");
  });
});

describe("getMatchupStandings", () => {
  it("is not_started with no matchups at all", async () => {
    const standings = await setup([]).service.getMatchupStandings();
    expect(standings).toEqual({ seasonName: "2026-27", state: "not_started" });
  });

  it("is not_started when matchups exist but none is live or final", async () => {
    // Only a week in the future of the clock: nothing is being played yet.
    const standings = await setup([matchup("2026-10-19", "a", "b")]).service.getMatchupStandings();
    expect(standings?.state).toBe("not_started");
  });

  it("is first_week_live with the pairings (viewer's split out) before any week has finished", async () => {
    const standings = await setup([
      matchup("2026-10-05", "a", "b", { start: [0, 3] }),
      matchup("2026-10-05", "c", "d", { start: [2, 1] }),
    ]).service.getMatchupStandings({ viewerId: "u3" });
    expect(standings).toMatchObject({
      state: "first_week_live",
      weekStart: "2026-10-05",
      rangeLabel: "Oct 5 – 11, 2026",
      awaitingRollover: false,
      mine: { home: { slug: "c" } },
    });
    if (standings?.state !== "first_week_live") throw new Error("wrong state");
    expect(standings.others.map((m) => m.home.slug)).toEqual(["a"]);
    // No record is shown yet: nobody has one.
    expect(standings.mine?.home.record).toBeNull();
  });

  it("is first_week_live and awaiting the rollover when the live week is an earlier one", async () => {
    const standings = await setup(
      [matchup("2026-10-05", "a", "b", { start: [0, 3] })],
      four(),
      new Date("2026-10-12T09:00:00Z"), // 5 am EDT Monday, before the rollover opens Oct 12
    ).service.getMatchupStandings();
    expect(standings).toMatchObject({
      state: "first_week_live",
      weekStart: "2026-10-05",
      awaitingRollover: true,
    });
  });

  it("ranks by record and names this week's opponent", async () => {
    const standings = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [1, 5] }), // b wins
      matchup("2026-09-28", "c", "d", { start: [0, 0], end: [4, 2] }), // c wins
      matchup("2026-10-05", "a", "c", { start: [1, 4] }),
      matchup("2026-10-05", "b", "d", { start: [5, 2] }),
    ]).service.getMatchupStandings({ viewerId: "u3" });

    expect(standings?.state).toBe("table");
    const rows = standings?.state === "table" ? standings.rows : [];
    expect(rows.map((r) => [r.slug, r.record.label, r.rankLabel, r.pointsGained])).toEqual([
      ["b", "1-0-0", "1", 5],
      ["c", "1-0-0", "2", 4],
      ["d", "0-1-0", "3", 2],
      ["a", "0-1-0", "4", 1],
    ]);
    const b = rows.find((r) => r.slug === "b");
    expect(b).toMatchObject({
      streak: { label: "W1", length: 1 },
      opponent: { slug: "d", name: "d" },
      seasonRank: 2,
      ownerName: "Owner u2",
      isMine: false,
    });
    expect(rows.find((r) => r.slug === "c")?.isMine).toBe(true);
  });

  it("has no opponent for a team on a bye", async () => {
    const standings = await setup([
      matchup("2026-09-28", "a", "b", { start: [0, 0], end: [1, 0] }),
      matchup("2026-10-05", "a", "b"),
    ]).service.getMatchupStandings();
    const rows = standings?.state === "table" ? standings.rows : [];
    expect(rows.find((r) => r.slug === "d")?.opponent).toBeNull();
    expect(rows.find((r) => r.slug === "a")?.opponent?.slug).toBe("b");
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
    expect(records.labelFor("a")).toBe("1-0-0");
    expect(records.labelFor("unknown")).toBeNull();
    expect(source).toHaveBeenCalledOnce();
  });

  it("draws nothing before a week has finished", async () => {
    const records = await setup([matchup("2026-10-05", "a", "b")]).service.getMatchupRecords();
    expect(records.recordFor("a")).toBeNull();
    expect(records.labelFor("a")).toBeNull();
  });
});
