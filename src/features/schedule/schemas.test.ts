import { describe, expect, it } from "vitest";
import { pairGamesHref, weekHref } from "./links";
import { gamesRangeSchema, weekSearchSchema } from "./schemas";

describe("weekSearchSchema", () => {
  it("accepts a Monday and a team slug", () => {
    expect(weekSearchSchema.parse({ week: "2026-10-05", team: "coop-doggies" })).toEqual({
      week: "2026-10-05",
      team: "coop-doggies",
    });
  });

  it("treats missing parameters as unset", () => {
    expect(weekSearchSchema.parse({})).toEqual({
      week: undefined,
      team: undefined,
      vs: undefined,
    });
  });

  it("ignores a week that is not a Monday or not a date, instead of failing the page", () => {
    for (const week of ["2026-10-06", "2026-02-30", "next", "", "20261005", "2026-10-05T00:00"]) {
      expect(weekSearchSchema.parse({ week }).week, week).toBeUndefined();
    }
  });

  it("ignores a repeated parameter (Next hands those over as an array)", () => {
    expect(
      weekSearchSchema.parse({ week: ["2026-10-05", "2026-10-12"], team: ["a", "b"] }),
    ).toEqual({
      week: undefined,
      team: undefined,
    });
  });

  it("ignores a team that is not shaped like a slug", () => {
    for (const team of ["Coop Doggies", "../admin", "a--b", "-a", "x".repeat(81), ""]) {
      expect(weekSearchSchema.parse({ team }).team, team).toBeUndefined();
    }
  });

  it("accepts a second team next to the first", () => {
    expect(weekSearchSchema.parse({ team: "coop", vs: "dirks" })).toEqual({
      week: undefined,
      team: "coop",
      vs: "dirks",
    });
  });

  it("ignores vs without a team, vs equal to the team, and a vs that is not a slug", () => {
    expect(weekSearchSchema.parse({ vs: "dirks" }).vs).toBeUndefined();
    expect(weekSearchSchema.parse({ team: "coop", vs: "coop" })).toMatchObject({
      team: "coop",
      vs: undefined,
    });
    for (const vs of ["Dirks", "a--b", "x".repeat(81), "", ["a", "b"]]) {
      expect(weekSearchSchema.parse({ team: "coop", vs }).vs, String(vs)).toBeUndefined();
    }
    // A bad team takes the pair with it: there is nothing for vs to be a second of.
    expect(weekSearchSchema.parse({ team: "A B", vs: "dirks" })).toMatchObject({
      team: undefined,
      vs: undefined,
    });
  });

  it("keeps one parameter when the other is bad", () => {
    expect(weekSearchSchema.parse({ week: "bad", team: "coop" })).toEqual({
      week: undefined,
      team: "coop",
    });
  });
});

describe("gamesRangeSchema", () => {
  it("accepts exactly live and weeks", () => {
    expect(gamesRangeSchema.safeParse("live").success).toBe(true);
    expect(gamesRangeSchema.safeParse("weeks").success).toBe(true);
    for (const bad of ["", "all", "LIVE", null, undefined]) {
      expect(gamesRangeSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe("weekHref", () => {
  it("leaves defaults out so the common links stay clean", () => {
    expect(weekHref()).toBe("/week");
    expect(weekHref({ week: null, team: null })).toBe("/week");
  });

  it("carries the week and the team", () => {
    expect(weekHref({ week: "2026-10-12" })).toBe("/week?week=2026-10-12");
    expect(weekHref({ team: "coop" })).toBe("/week?team=coop");
    expect(weekHref({ week: "2026-10-12", team: "coop" })).toBe("/week?week=2026-10-12&team=coop");
  });

  it("adds the second team only next to a first", () => {
    expect(weekHref({ team: "coop", vs: "dirks" })).toBe("/week?team=coop&vs=dirks");
    expect(weekHref({ week: "2026-10-12", team: "coop", vs: "dirks" })).toBe(
      "/week?week=2026-10-12&team=coop&vs=dirks",
    );
    expect(weekHref({ vs: "dirks" })).toBe("/week");
  });
});

describe("pairGamesHref", () => {
  it("links to the pair's games and the list, leaving the current week out", () => {
    expect(
      pairGamesHref({ weekStart: "2026-10-05", currentWeek: "2026-10-05", teams: ["a", "b"] }),
    ).toBe("/week?team=a&vs=b#games");
  });

  it("keeps any other week", () => {
    expect(
      pairGamesHref({ weekStart: "2026-09-28", currentWeek: "2026-10-05", teams: ["a", "b"] }),
    ).toBe("/week?week=2026-09-28&team=a&vs=b#games");
  });
});
