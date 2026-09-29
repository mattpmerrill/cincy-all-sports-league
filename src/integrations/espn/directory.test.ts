import { describe, expect, it } from "vitest";
import coreGroup80 from "./__fixtures__/core-groups-cfb-80.json";
import coreGroup81 from "./__fixtures__/core-groups-cfb-81.json";
import fedex2026 from "./__fixtures__/fedex-standings-2026.json";
import fedex2027Empty from "./__fixtures__/fedex-standings-2027-empty.json";
import pgaAthlete9478 from "./__fixtures__/pga-athlete-9478.json";
import teamsCfb from "./__fixtures__/teams-cfb-sample.json";
import teamsMlb from "./__fixtures__/teams-mlb.json";
import teamsSoftball from "./__fixtures__/teams-softball-edge.json";
import wtaDirectory from "./__fixtures__/wta-rankings-directory.json";
import { fetchAthleteDirectory, fetchTeamDirectory, type DirectorySkip } from "./directory";
import { fetchPgaSeasonStandings } from "./rankings";
import { jsonResponse, noSleep, scriptedFetch } from "./test-utils";

const okValue = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
};

describe("fetchTeamDirectory", () => {
  it("maps a pro league: displayName, short display name, first logo, # + lowercase color", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse(teamsMlb));
    const entries = okValue(await fetchTeamDirectory("mlb", 2026, { fetchImpl }));

    expect(calls).toEqual([
      "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=1000",
    ]);
    expect(entries[0]).toEqual({
      espnId: "29",
      name: "Arizona Diamondbacks",
      shortName: "Diamondbacks",
      logoUrl: "https://a.espncdn.com/i/teamlogos/mlb/500/ari.png",
      primaryColor: "#aa182c",
    });
  });

  it("uses the school (location) as the short name for college teams", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(teamsSoftball));
    const entries = okValue(await fetchTeamDirectory("ncaasb", 2026, { fetchImpl }));
    expect(entries.find((e) => e.name === "Air Force Falcons")?.shortName).toBe("Air Force");
    expect(entries.find((e) => e.name === "Alabama Huntsville Chargers")?.shortName).toBe(
      "Alabama Huntsville",
    );
  });

  it("lowercases an upper-case color and turns a missing color or logo into null", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(teamsSoftball));
    const entries = okValue(await fetchTeamDirectory("ncaasb", 2026, { fetchImpl }));

    expect(entries.find((e) => e.espnId === "567")?.primaryColor).toBe("#004a7b");
    expect(entries.find((e) => e.espnId === "860")).toMatchObject({
      logoUrl: null,
      primaryColor: null,
    });
    for (const e of entries) expect(e.primaryColor ?? "#000000").toMatch(/^#[0-9a-f]{6}$/);
  });

  it("softball: drops TBD placeholders and keeps the higher id of a duplicate name, reporting both", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(teamsSoftball));
    const skipped: DirectorySkip[] = [];
    const entries = okValue(
      await fetchTeamDirectory("ncaasb", 2026, { fetchImpl, onSkip: (s) => skipped.push(s) }),
    );
    const ids = entries.map((e) => e.espnId);

    expect(ids).not.toContain("1195");
    expect(ids).not.toContain("1196");
    // The higher id has the schedule; the lower id has none.
    expect(ids).toEqual(expect.arrayContaining(["1140", "1283", "1285"]));
    expect(ids).not.toContain("529");
    expect(ids).not.toContain("583");
    expect(ids).not.toContain("620");
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
    expect(skipped).toEqual(
      expect.arrayContaining([
        { espnId: "1195", name: "TBD", reason: "placeholder" },
        { espnId: "529", name: "Clemson Tigers", reason: "duplicate_name" },
      ]),
    );
    expect(skipped).toHaveLength(2 + 3);
  });

  it("college football keeps FBS + FCS only, using the core group lists", async () => {
    const { fetchImpl, calls } = scriptedFetch((url) => {
      if (url.includes("/groups/80/")) return jsonResponse(coreGroup80);
      if (url.includes("/groups/81/")) return jsonResponse(coreGroup81);
      return jsonResponse(teamsCfb);
    });
    const entries = okValue(await fetchTeamDirectory("ncaaf", 2026, { fetchImpl }));

    expect(calls).toContain(
      "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/types/2/groups/80/teams?limit=1000",
    );
    expect(calls).toContain(
      "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/types/2/groups/81/teams?limit=1000",
    );
    // Adams State, Adrian and both Roosevelt rows are not in either group. The group fixture also
    // lists id 3193 ("American", a placeholder) that the site list does not carry: no crash.
    expect(entries.map((e) => e.espnId).sort()).toEqual(
      ["16", "2000", "2005", "2130", "2449", "333"].sort(),
    );
  });

  it("fails the whole load when a core group cannot be read, rather than returning a partial pool", async () => {
    const { fetchImpl } = scriptedFetch((url) =>
      url.includes("/groups/81/")
        ? jsonResponse({}, 404)
        : url.includes("/groups/")
          ? jsonResponse(coreGroup80)
          : jsonResponse(teamsCfb),
    );
    const result = await fetchTeamDirectory("ncaaf", 2026, { fetchImpl });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_not_found" } });
  });

  it("fails loudly when the teams response changes shape", async () => {
    const { fetchImpl } = scriptedFetch(() =>
      jsonResponse({ sports: [{ leagues: [{ teams: [{}] }] }] }),
    );
    expect(await fetchTeamDirectory("mlb", 2026, { fetchImpl })).toMatchObject({
      ok: false,
      error: { code: "espn_shape" },
    });
  });

  it("refuses athlete sports", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}));
    expect(await fetchTeamDirectory("wta", 2026, { fetchImpl })).toMatchObject({
      ok: false,
      error: { code: "espn_unsupported" },
    });
    expect(calls).toEqual([]);
  });
});

describe("fetchAthleteDirectory: WTA", () => {
  it("returns the top `limit` ranked athletes with last name and headshot when ESPN has one", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(wtaDirectory));
    const entries = okValue(
      await fetchAthleteDirectory("wta", 2026, { limit: 5, knownIds: new Set() }, { fetchImpl }),
    );

    expect(entries.map((e) => e.espnId)).toEqual(["3126", "3038", "2113", "3626", "9820"]);
    expect(entries[0]).toEqual({
      espnId: "3126",
      name: "Elena Rybakina",
      shortName: "Rybakina",
      logoUrl: "https://a.espncdn.com/i/headshots/tennis/players/full/3126.png",
      primaryColor: null,
    });
    // Rank 5 has no headshot in the ranking payload.
    expect(entries[4]?.logoUrl).toBeNull();
  });

  it("skips ids the caller already stores, without shrinking the ranking window", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(wtaDirectory));
    const entries = okValue(
      await fetchAthleteDirectory(
        "wta",
        2026,
        { limit: 3, knownIds: new Set(["3038"]) },
        { fetchImpl },
      ),
    );
    // Top 3 by rank are 3126, 3038, 2113; the known one drops out and rank 4 does not slide in.
    expect(entries.map((e) => e.espnId)).toEqual(["3126", "2113"]);
  });
});

describe("empty FedExCup season", () => {
  it("reads the 2027 payload (no `standings` key) as no standings yet, not a shape error", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(fedex2027Empty));
    expect(await fetchPgaSeasonStandings(2027, { fetchImpl })).toEqual({ ok: true, value: [] });
  });
});

describe("fetchAthleteDirectory: PGA", () => {
  const athleteFor = (id: string) => ({
    ...pgaAthlete9478,
    id,
    displayName: `Golfer ${id}`,
    lastName: `Last${id}`,
    headshot: { href: `https://a.espncdn.com/i/headshots/golf/players/full/${id}.png` },
  });

  /** 2027 has no standings yet; 2026 has three scorers (9478, 9037, 11119). */
  function pgaFeed(overrides: (url: string) => Response | undefined = () => undefined) {
    return scriptedFetch((url) => {
      const override = overrides(url);
      if (override) return override;
      if (url.includes("/seasons/2027/types/2/standings/0")) return jsonResponse(fedex2027Empty);
      if (url.includes("/seasons/2026/types/2/standings/0")) return jsonResponse(fedex2026);
      const athlete = /\/athletes\/(\d+)/.exec(url)?.[1];
      if (athlete === "9478") return jsonResponse(pgaAthlete9478);
      if (athlete) return jsonResponse(athleteFor(athlete));
      return jsonResponse({}, 404);
    });
  }

  it("falls back to the previous season when the current one has no standings", async () => {
    const { fetchImpl, calls } = pgaFeed();
    const entries = okValue(
      await fetchAthleteDirectory("pga", 2027, { limit: 100, knownIds: new Set() }, { fetchImpl }),
    );

    expect(calls[0]).toContain("/seasons/2027/types/2/standings/0");
    expect(calls[1]).toContain("/seasons/2026/types/2/standings/0");
    // Ranked order, names from the athlete endpoint of the season that had standings.
    expect(entries.map((e) => e.espnId)).toEqual(["9478", "9037", "11119"]);
    expect(entries[0]).toEqual({
      espnId: "9478",
      name: "Scottie Scheffler",
      shortName: "Scheffler",
      logoUrl: "https://a.espncdn.com/i/headshots/golf/players/full/9478.png",
      primaryColor: null,
    });
    expect(calls.some((c) => c.includes("/seasons/2026/athletes/9037"))).toBe(true);
  });

  it("uses the requested season when it already has standings", async () => {
    const { fetchImpl, calls } = pgaFeed();
    okValue(
      await fetchAthleteDirectory("pga", 2026, { limit: 1, knownIds: new Set() }, { fetchImpl }),
    );
    expect(calls.filter((c) => c.includes("standings"))).toHaveLength(1);
    expect(calls.filter((c) => c.includes("/athletes/"))).toHaveLength(1);
  });

  it("fetches athlete details only for ids the caller does not already have", async () => {
    const { fetchImpl, calls } = pgaFeed();
    const entries = okValue(
      await fetchAthleteDirectory(
        "pga",
        2026,
        { limit: 100, knownIds: new Set(["9478", "9037"]) },
        { fetchImpl },
      ),
    );
    expect(entries.map((e) => e.espnId)).toEqual(["11119"]);
    expect(calls.filter((c) => c.includes("/athletes/"))).toHaveLength(1);
    expect(calls.some((c) => c.includes("/athletes/9478"))).toBe(false);
  });

  it("applies the limit to the ranking before spending detail calls", async () => {
    const { fetchImpl, calls } = pgaFeed();
    const entries = okValue(
      await fetchAthleteDirectory("pga", 2026, { limit: 2, knownIds: new Set() }, { fetchImpl }),
    );
    expect(entries.map((e) => e.espnId)).toEqual(["9478", "9037"]);
    expect(calls.filter((c) => c.includes("/athletes/"))).toHaveLength(2);
  });

  it("skips an athlete ESPN has no record of but keeps the rest of the pool", async () => {
    const { fetchImpl } = pgaFeed((url) =>
      url.includes("/athletes/9037") ? jsonResponse({}, 404) : undefined,
    );
    const entries = okValue(
      await fetchAthleteDirectory("pga", 2026, { limit: 100, knownIds: new Set() }, { fetchImpl }),
    );
    expect(entries.map((e) => e.espnId)).toEqual(["9478", "11119"]);
  });

  it("fails the load on a transient athlete error so a rerun can complete the pool", async () => {
    const { fetchImpl } = pgaFeed((url) =>
      url.includes("/athletes/9037") ? jsonResponse({}, 503) : undefined,
    );
    const result = await fetchAthleteDirectory(
      "pga",
      2026,
      { limit: 100, knownIds: new Set() },
      { fetchImpl, sleep: noSleep, maxAttempts: 2 },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "espn_http" } });
  });
});
