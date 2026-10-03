import { describe, expect, it, vi } from "vitest";
import { leagueData } from "@/domain/league/fixtures";
import type { Game } from "@/domain/schedule";
import { game, side } from "@/domain/schedule/fixtures";
import { createScheduleService } from "./schedule.service";

const matt = { id: "u1", displayName: "Matt", avatarUrl: null };

// Wed Oct 7 2026, noon Eastern: the current league week starts Mon Oct 5.
const now = new Date("2026-10-07T16:00:00Z");

/** A games source that behaves like the database filter: `[from, to)` on the start instant. */
function setup(games: Game[], options: { data?: ReturnType<typeof leagueData> | null } = {}) {
  const source = vi.fn(async (_season: string, fromIso: string, toIso: string) =>
    games.filter((g) => {
      const t = new Date(g.startsAt).getTime();
      return t >= new Date(fromIso).getTime() && t < new Date(toIso).getTime();
    }),
  );
  const data =
    options.data === undefined
      ? leagueData({ teams: [{ id: "a", owner: matt }, { id: "b" }, { id: "c" }] })
      : options.data;
  const service = createScheduleService({
    league: async () => data,
    games: source,
    now: () => now,
  });
  return { service, source };
}

// Team a holds a-nfl, b holds b-nfl; c holds c-nfl.
const showdown = game({
  home: side("a-nfl", { name: "Steelers", shortName: "PIT" }),
  away: side("b-nfl", { name: "Bengals", shortName: "CIN" }),
  startsAt: "2026-10-11T17:00:00Z", // Sun Oct 11, 1 pm
});
const soloA = game({
  home: side("opp"),
  away: side("a-nfl"),
  startsAt: "2026-10-08T00:20:00Z", // Wed Oct 7, 8:20 pm
});
const unheld = game({ home: side("x"), away: side("y"), startsAt: "2026-10-08T17:00:00Z" });

describe("getWeek: choosing the week", () => {
  it("is null before a season exists", async () => {
    expect(await setup([], { data: null }).service.getWeek({})).toBeNull();
  });

  it("opens on the current Eastern week and asks the cache for exactly that week", async () => {
    const { service, source } = setup([]);
    const page = await service.getWeek({});
    expect(page).toMatchObject({
      weekStart: "2026-10-05",
      rangeLabel: "Oct 5 – 11, 2026",
      isCurrentWeek: true,
      currentWeek: "2026-10-05",
      prevWeek: "2026-09-28",
      nextWeek: "2026-10-12",
    });
    expect(source).toHaveBeenCalledWith(
      "s1",
      "2026-10-05T04:00:00.000Z",
      "2026-10-12T04:00:00.000Z",
    );
  });

  it("asks for a 169-hour range across the November fall-back", async () => {
    const { service, source } = setup([]);
    await service.getWeek({ weekStart: "2026-10-26" });
    const [, from, to] = source.mock.calls[0] ?? [];
    expect(from).toBe("2026-10-26T04:00:00.000Z");
    expect(to).toBe("2026-11-02T05:00:00.000Z");
  });

  it("steps to another week and says it is not the current one", async () => {
    const page = await setup([]).service.getWeek({ weekStart: "2026-10-12" });
    expect(page).toMatchObject({
      weekStart: "2026-10-12",
      isCurrentWeek: false,
      currentWeek: "2026-10-05",
    });
  });

  it("pulls a week outside the season back into it and ends the prev/next links at its edges", async () => {
    const { service } = setup([]);
    const late = await service.getWeek({ weekStart: "2099-01-04" });
    expect(late).toMatchObject({ weekStart: "2027-11-15", nextWeek: null });
    expect(late?.prevWeek).toBe("2027-11-08");
    const early = await service.getWeek({ weekStart: "1999-01-04" });
    // The season starts Thu Aug 27 2026, so its first week starts Mon Aug 24.
    expect(early).toMatchObject({ weekStart: "2026-08-24", prevWeek: null });
  });
});

describe("getWeek: the slate", () => {
  it("lists days with headings, marks today, and attaches each game's neutral status line", async () => {
    const page = await setup([soloA, showdown, unheld]).service.getWeek({});
    expect(page?.days).toHaveLength(7);
    expect(page?.days.map((d) => d.isToday)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(page?.days[2]?.heading).toBe("Wednesday, Oct 7");
    // 00:20 UTC Thursday is 8:20 pm Wednesday in Cincinnati.
    expect(page?.days[2]?.games.map((g) => [g.id, g.line.text])).toEqual([[soloA.id, "8:20 PM"]]);
    expect(page?.days[6]?.games[0]).toMatchObject({ id: showdown.id, isShowdown: true });
    expect(page?.gameCount).toBe(2);
    expect(page?.showdownCount).toBe(1);
  });

  it("counts games for every team, zeros included, whatever the filter", async () => {
    const page = await setup([soloA, showdown]).service.getWeek({ teamSlug: "c" });
    expect(page?.teams.map((t) => [t.team.slug, t.games])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 0],
    ]);
  });
});

describe("getWeek: the team filter", () => {
  it("narrows the days to one team's games and keeps the strip whole", async () => {
    const page = await setup([soloA, showdown]).service.getWeek({ teamSlug: "b" });
    expect(page?.selectedTeam).toEqual({ slug: "b", name: "b" });
    expect(page?.gameCount).toBe(1);
    expect(page?.days.flatMap((d) => d.games.map((g) => g.id))).toEqual([showdown.id]);
    expect(page?.teams).toHaveLength(3);
  });

  it("ignores a team slug it does not know instead of showing nothing", async () => {
    const page = await setup([soloA, showdown]).service.getWeek({ teamSlug: "ghost" });
    expect(page?.selectedTeam).toBeNull();
    expect(page?.gameCount).toBe(2);
  });

  it("offers every team by name for the select", async () => {
    const page = await setup([]).service.getWeek({});
    expect(page?.teamOptions.map((t) => t.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("getWeek: My team", () => {
  it("finds the signed-in owner's team and nobody else's", async () => {
    const { service } = setup([]);
    expect((await service.getWeek({ viewerId: "u1" }))?.myTeam).toEqual({ slug: "a", name: "a" });
    expect((await service.getWeek({ viewerId: "stranger" }))?.myTeam).toBeNull();
    expect((await service.getWeek({ viewerId: null }))?.myTeam).toBeNull();
    expect((await service.getWeek({}))?.myTeam).toBeNull();
  });
});

describe("getWeek: empty states", () => {
  it("says schedules have not loaded when no games are stored for the week", async () => {
    expect((await setup([]).service.getWeek({}))?.empty).toBe("not_loaded");
  });

  it("says no picks play when games exist but none involve one", async () => {
    expect((await setup([unheld]).service.getWeek({}))?.empty).toBe("no_games");
  });

  it("says the chosen team is idle when others play but it does not", async () => {
    const page = await setup([soloA]).service.getWeek({ teamSlug: "c" });
    expect(page?.empty).toBe("team_idle");
  });

  it("has no empty state when there is something to show", async () => {
    expect((await setup([soloA]).service.getWeek({}))?.empty).toBeNull();
    expect((await setup([soloA]).service.getWeek({ teamSlug: "a" }))?.empty).toBeNull();
  });
});

describe("getWeek: late games and daylight saving", () => {
  it("keeps a 10:30 pm Sunday game on Sunday in this week, not Monday in the next", async () => {
    const late = game({
      sport: "nba",
      home: side("a-nba"),
      away: side("z"),
      startsAt: "2026-10-12T02:30:00Z", // Sun Oct 11, 10:30 pm EDT
    });
    const { service } = setup([late]);
    expect((await service.getWeek({}))?.days[6]?.games).toHaveLength(1);
    expect((await service.getWeek({ weekStart: "2026-10-12" }))?.gameCount).toBe(0);
  });
});

describe("getTeamWeek", () => {
  it("is null for an unknown team and before a season", async () => {
    expect(await setup([showdown]).service.getTeamWeek("ghost")).toBeNull();
    expect(await setup([], { data: null }).service.getTeamWeek("a")).toBeNull();
  });

  it("lists the team's games from its own side, in start order, with the opponent and result", async () => {
    const finalGame = game({
      status: "final",
      statusDetail: "Final",
      home: side("a-nfl", { score: 27, winner: true }),
      away: side("o", { score: 24, winner: false, shortName: "OPP" }),
      startsAt: "2026-10-06T00:20:00Z", // Mon Oct 5, 8:20 pm
    });
    const week = await setup([showdown, soloA, finalGame]).service.getTeamWeek("a");

    expect(week).toMatchObject({ teamName: "a", slug: "a", weekStart: "2026-10-05" });
    expect(week?.games.map((g) => [g.day, g.side, g.opponent.shortName, g.result.text])).toEqual([
      ["Mon", "home", "OPP", "W 27–24"],
      ["Wed", "away", "OPP", "Wed 8:20 PM"],
      ["Sun", "home", "CIN", "Sun 1:00 PM"],
    ]);
    expect(week?.games[2]).toMatchObject({ sportLabel: "NFL", isShowdown: true });
  });

  it("reads a game as a loss from the team's side when it is the away team that lost", async () => {
    const lost = game({
      status: "final",
      home: side("opp", { score: 31, winner: true }),
      away: side("a-nfl", { score: 10, winner: false }),
      startsAt: "2026-10-06T17:00:00Z",
    });
    const week = await setup([lost]).service.getTeamWeek("a");
    expect(week?.games[0]?.result).toMatchObject({ tone: "loss", text: "L 10–31" });
  });

  it("says @ when the team travels and vs at home or on a neutral field", async () => {
    const neutral = game({
      neutralSite: true,
      home: side("opp"),
      away: side("a-nfl"),
      startsAt: "2026-10-09T23:00:00Z",
    });
    const week = await setup([showdown, soloA, neutral]).service.getTeamWeek("a");
    // soloA: away -> "@"; neutral: away on a neutral field -> "vs"; showdown: home -> "vs".
    expect(week?.games.map((g) => g.connector)).toEqual(["@", "vs", "vs"]);
  });

  it("returns an empty list for a team whose picks do not play", async () => {
    const week = await setup([showdown]).service.getTeamWeek("c");
    expect(week).toMatchObject({ teamName: "c", games: [] });
  });
});
