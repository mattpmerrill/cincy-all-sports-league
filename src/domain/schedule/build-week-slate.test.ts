import { describe, expect, it } from "vitest";
import { buildWeekSlate, filterSlateToTeams, teamGames, teamSide } from "./build-week-slate";
import { game, side, team } from "./fixtures";

const WEEK = "2026-10-05"; // Mon Oct 5 - Sun Oct 11

const gamesOn = (slate: ReturnType<typeof buildWeekSlate>, date: string) =>
  slate.days.find((d) => d.date === date)?.games ?? [];

describe("buildWeekSlate: days and order", () => {
  const teams = [team("a", [{ sport: "nfl", participantId: "pit" }])];

  it("always returns seven days, Monday first, empty ones included", () => {
    const slate = buildWeekSlate({ weekStart: WEEK, games: [], teams });
    expect(slate.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(slate.weekEnd).toBe("2026-10-11");
    expect(slate.gameCount).toBe(0);
  });

  it("orders each day by start time, then sport, and puts games on their Eastern day", () => {
    const late = game({ home: side("pit"), away: side("cin"), startsAt: "2026-10-08T00:20:00Z" }); // Wed 8:20 pm
    const early = game({ home: side("pit"), away: side("bal"), startsAt: "2026-10-07T17:00:00Z" }); // Wed 1 pm
    const slate = buildWeekSlate({ weekStart: WEEK, games: [late, early], teams });
    expect(gamesOn(slate, "2026-10-07").map((g) => g.id)).toEqual([early.id, late.id]);
    expect(gamesOn(slate, "2026-10-08")).toEqual([]);
  });

  it("breaks a start-time tie by the catalog's sport order, not insertion order", () => {
    const both = [
      team("a", [
        { sport: "nfl", participantId: "x" },
        { sport: "mlb", participantId: "x" },
      ]),
    ];
    const nfl = game({ sport: "nfl", home: side("x"), away: side("y") });
    const mlb = game({ sport: "mlb", home: side("x"), away: side("z") });
    const slate = buildWeekSlate({
      weekStart: WEEK,
      games: [nfl, mlb].map((g) => ({ ...g, startsAt: "2026-10-06T23:00:00Z" })),
      teams: both,
    });
    expect(gamesOn(slate, "2026-10-06").map((g) => g.sport)).toEqual(["mlb", "nfl"]);
  });
});

describe("buildWeekSlate: Eastern days, midnight and daylight saving", () => {
  const teams = [team("a", [{ sport: "nba", participantId: "cle" }])];
  const nba = (startsAt: string) =>
    game({ sport: "nba", home: side("cle"), away: side("bos"), startsAt });

  it("keeps a 10:30 pm Sunday tip-off on Sunday, in this week, although UTC says Monday", () => {
    const tip = nba("2026-10-12T02:30:00Z"); // Sun Oct 11, 10:30 pm EDT
    const thisWeek = buildWeekSlate({ weekStart: WEEK, games: [tip], teams });
    expect(gamesOn(thisWeek, "2026-10-11")).toHaveLength(1);
    const nextWeek = buildWeekSlate({ weekStart: "2026-10-12", games: [tip], teams });
    expect(nextWeek.gameCount).toBe(0);
  });

  it("moves to Monday exactly at Eastern midnight", () => {
    const before = nba("2026-10-12T03:59:59Z");
    const after = nba("2026-10-12T04:00:00Z");
    const next = buildWeekSlate({ weekStart: "2026-10-12", games: [before, after], teams });
    expect(next.gameCount).toBe(1);
    expect(gamesOn(next, "2026-10-12")[0]?.id).toBe(after.id);
  });

  it("holds across the fall-back: Sunday Nov 1 at 11:30 pm EST is Nov 1, 12:30 am Monday is Nov 2", () => {
    const sunday = nba("2026-11-02T04:30:00Z"); // 11:30 pm EST
    const monday = nba("2026-11-02T05:30:00Z"); // 12:30 am EST
    const week = buildWeekSlate({ weekStart: "2026-10-26", games: [sunday, monday], teams });
    expect(gamesOn(week, "2026-11-01").map((g) => g.id)).toEqual([sunday.id]);
    expect(week.gameCount).toBe(1);
    const next = buildWeekSlate({ weekStart: "2026-11-02", games: [sunday, monday], teams });
    expect(gamesOn(next, "2026-11-02").map((g) => g.id)).toEqual([monday.id]);
  });

  it("holds across the spring-forward: Saturday Mar 13 2027 at 11:59 pm EST stays Saturday", () => {
    const saturday = nba("2027-03-14T04:59:00Z"); // 11:59 pm EST, an hour before the clocks jump
    const sunday = nba("2027-03-14T05:00:00Z"); // 12:00 am EST
    const week = buildWeekSlate({ weekStart: "2027-03-08", games: [saturday, sunday], teams });
    expect(gamesOn(week, "2027-03-13").map((g) => g.id)).toEqual([saturday.id]);
    expect(gamesOn(week, "2027-03-14").map((g) => g.id)).toEqual([sunday.id]);
  });
});

describe("buildWeekSlate: who has a stake", () => {
  it("drops games nobody holds and games outside the week", () => {
    const teams = [team("a", [{ sport: "nfl", participantId: "pit" }])];
    const mine = game({ home: side("pit"), away: side("cin") });
    const unheld = game({ home: side("bal"), away: side("cle") });
    const lastWeek = game({
      home: side("pit"),
      away: side("cin"),
      startsAt: "2026-09-27T17:00:00Z",
    });
    const slate = buildWeekSlate({ weekStart: WEEK, games: [mine, unheld, lastWeek], teams });
    expect(slate.gameCount).toBe(0); // Oct 4 belongs to the week of Sep 28
    const prior = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [mine, unheld, lastWeek],
      teams,
    });
    expect(prior.days.flatMap((d) => d.games.map((g) => g.id))).toEqual([mine.id]);
  });

  it("never matches a participant across sports", () => {
    const teams = [team("a", [{ sport: "nfl", participantId: "x" }])];
    const nbaGame = game({
      sport: "nba",
      home: side("x"),
      away: side("y"),
      startsAt: "2026-10-06T23:00:00Z",
    });
    expect(buildWeekSlate({ weekStart: WEEK, games: [nbaGame], teams }).gameCount).toBe(0);
  });

  it("ignores a side with no participant row, so an unmapped opponent holds nothing", () => {
    const teams = [team("a", [{ sport: "ncaaf", participantId: "uc" }])];
    const g = game({
      sport: "ncaaf",
      startsAt: "2026-10-10T16:00:00Z",
      home: side("uc"),
      away: side("fcs", { participantId: null }),
    });
    const slate = buildWeekSlate({ weekStart: WEEK, games: [g], teams });
    const only = gamesOn(slate, "2026-10-10")[0];
    expect(only?.stakes.home.map((s) => s.teamId)).toEqual(["a"]);
    expect(only?.stakes.away).toEqual([]);
    expect(only?.isShowdown).toBe(false);
  });

  it("lists the same team once per game even when it plays twice in a day", () => {
    const teams = [team("a", [{ sport: "mlb", participantId: "cin" }])];
    const doubleheader = [
      game({
        sport: "mlb",
        home: side("cin"),
        away: side("chc"),
        startsAt: "2026-10-06T17:00:00Z",
      }),
      game({
        sport: "mlb",
        home: side("cin"),
        away: side("chc"),
        startsAt: "2026-10-06T23:00:00Z",
      }),
    ];
    const slate = buildWeekSlate({ weekStart: WEEK, games: doubleheader, teams });
    expect(slate.teams[0]).toMatchObject({ games: 2 });
    expect(gamesOn(slate, "2026-10-06")).toHaveLength(2);
  });

  it("drops a repeat of one game, which two college team schedules both report", () => {
    const teams = [team("a", [{ sport: "ncaaf", participantId: "uc" }])];
    const first = game({ sport: "ncaaf", home: side("uc"), away: side("ku"), externalId: "same" });
    const again = { ...first, id: "other-row" };
    const slate = buildWeekSlate({ weekStart: "2026-09-28", games: [first, again], teams });
    expect(slate.gameCount).toBe(1);
  });
});

describe("buildWeekSlate: showdowns", () => {
  it("marks a game where two different teams hold opposite sides", () => {
    const teams = [
      team("a", [{ sport: "nfl", participantId: "pit" }]),
      team("b", [{ sport: "nfl", participantId: "cin" }]),
    ];
    const slate = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [game({ home: side("pit"), away: side("cin") })],
      teams,
    });
    expect(slate.days[6]?.games[0]).toMatchObject({ isShowdown: true });
    expect(slate.showdownCount).toBe(1);
  });

  it("is not a showdown when only one side is held", () => {
    const teams = [team("a", [{ sport: "nfl", participantId: "pit" }])];
    const slate = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [game({ home: side("pit"), away: side("cin") })],
      teams,
    });
    expect(slate.days[6]?.games[0]?.isShowdown).toBe(false);
    expect(slate.showdownCount).toBe(0);
  });

  it("treats two teams that share a duplicate WNBA pick on the same side as rooting together", () => {
    const teams = [
      team("a", [{ sport: "wnba", participantId: "ind" }]),
      team("b", [{ sport: "wnba", participantId: "ind" }]),
    ];
    const slate = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [game({ sport: "wnba", home: side("ind"), away: side("lv") })],
      teams,
    });
    const g = slate.days[6]?.games[0];
    expect(g?.stakes.home.map((s) => s.teamId)).toEqual(["a", "b"]);
    expect(g?.isShowdown).toBe(false);
    expect(slate.teams.map((t) => t.games)).toEqual([1, 1]);
  });

  it("is a showdown when duplicate holders of one side face a holder of the other", () => {
    const teams = [
      team("a", [{ sport: "wnba", participantId: "ind" }]),
      team("b", [{ sport: "wnba", participantId: "ind" }]),
      team("c", [{ sport: "wnba", participantId: "lv" }]),
    ];
    const slate = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [game({ sport: "wnba", home: side("ind"), away: side("lv") })],
      teams,
    });
    expect(slate.days[6]?.games[0]).toMatchObject({ isShowdown: true });
    expect(slate.teams.map((t) => t.games)).toEqual([1, 1, 1]);
  });

  it("is not a showdown when the same team holds a participant on both sides (bad data, counted once)", () => {
    const teams = [team("a", [{ sport: "nfl", participantId: "pit" }])];
    const odd = game({ home: side("pit"), away: side("pit") });
    const slate = buildWeekSlate({ weekStart: "2026-09-28", games: [odd], teams });
    expect(slate.days[6]?.games[0]?.isShowdown).toBe(false);
    expect(slate.teams[0]?.games).toBe(1);
  });
});

describe("buildWeekSlate: games per team", () => {
  it("counts every team including those with no games, busiest first then by name", () => {
    const teams = [
      team("a", [{ sport: "nfl", participantId: "pit" }]),
      team("b", [{ sport: "nfl", participantId: "cin" }]),
      team("c", [{ sport: "nfl", participantId: "bal" }]),
      team("d", [{ sport: "nfl", participantId: "ten" }]),
    ];
    const games = [
      game({ home: side("pit"), away: side("cin") }),
      game({ home: side("bal"), away: side("x"), startsAt: "2026-10-01T23:00:00Z" }),
    ];
    const slate = buildWeekSlate({ weekStart: "2026-09-28", games, teams });
    expect(slate.teams.map((t) => [t.team.slug, t.games])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
      ["d", 0],
    ]);
  });

  it("carries the owner so a chip can show their avatar", () => {
    const owner = { id: "u1", displayName: "Matt", avatarUrl: null };
    const teams = [team("a", [{ sport: "nfl", participantId: "pit" }], owner)];
    const slate = buildWeekSlate({
      weekStart: "2026-09-28",
      games: [game({ home: side("pit"), away: side("cin") })],
      teams,
    });
    expect(slate.days[6]?.games[0]?.stakes.home[0]?.owner).toEqual(owner);
  });
});

describe("per-team views", () => {
  const teams = [
    team("a", [
      { sport: "nfl", participantId: "pit" },
      { sport: "nhl", participantId: "pen" },
    ]),
    team("b", [{ sport: "nfl", participantId: "cin" }]),
  ];
  const nfl = game({ home: side("pit"), away: side("cin"), startsAt: "2026-10-04T17:00:00Z" });
  const nhl = game({
    sport: "nhl",
    home: side("nyr"),
    away: side("pen"),
    startsAt: "2026-10-01T23:00:00Z",
  });
  const slate = buildWeekSlate({ weekStart: "2026-09-28", games: [nfl, nhl], teams });

  it("lists a team's games in start order with the side it plays", () => {
    const mine = teamGames(slate, "a");
    expect(mine.map((g) => g.id)).toEqual([nhl.id, nfl.id]);
    expect(teamSide(mine[0]!, "a")).toBe("away");
    expect(teamSide(mine[1]!, "a")).toBe("home");
    expect(teamSide(mine[1]!, "b")).toBe("away");
    expect(teamSide(mine[0]!, "b")).toBeNull();
  });

  it("narrows the days to one team but keeps every team in the strip", () => {
    const filtered = filterSlateToTeams(slate, ["b"]);
    expect(filtered.gameCount).toBe(1);
    expect(filtered.showdownCount).toBe(1);
    expect(filtered.teams).toEqual(slate.teams);
    expect(filtered.days).toHaveLength(7);
  });

  it("shows the games either of two teams has a stake in, a shared game once", () => {
    const filtered = filterSlateToTeams(slate, ["a", "b"]);
    expect(filtered.days.flatMap((d) => d.games.map((g) => g.id))).toEqual([nhl.id, nfl.id]);
    expect(filtered.showdownCount).toBe(1);
    expect(filterSlateToTeams(slate, ["b", "nobody"]).gameCount).toBe(1);
  });

  it("shows nothing for no team at all", () => {
    expect(filterSlateToTeams(slate, []).gameCount).toBe(0);
  });

  it("returns an empty list for a team with no games", () => {
    expect(teamGames(slate, "nobody")).toEqual([]);
  });
});
