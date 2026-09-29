import { describe, expect, it } from "vitest";
import mlsStandings from "./__fixtures__/standings-mls-2026.json";
import nfl2022 from "./__fixtures__/standings-nfl-2022.json";
import nfl2026 from "./__fixtures__/standings-nfl-2026.json";
import arizonaSchedule from "./__fixtures__/schedule-ncaab-arizona-2026.json";
import { fetchTeamRecords, recordFromSchedule, recordsFromStandings } from "./records";
import { standingsSchema, teamScheduleSchema } from "./schemas";
import { jsonResponse, noSleep, scriptedFetch } from "./test-utils";

const byId = (records: ReturnType<typeof recordsFromStandings>, id: string) =>
  records.find((r) => r.espnTeamId === id);

describe("recordsFromStandings", () => {
  it("keeps NFL ties (2022 Colts finished 4-12-1)", () => {
    const records = recordsFromStandings(standingsSchema.parse(nfl2022));
    expect(byId(records, "11")).toEqual({ espnTeamId: "11", wins: 4, losses: 12, ties: 1 });
  });

  it("reads MLS draws from ESPN's `ties` stat (Chicago: 12 W, 8 L, 6 D)", () => {
    const records = recordsFromStandings(standingsSchema.parse(mlsStandings));
    expect(byId(records, "182")).toEqual({ espnTeamId: "182", wins: 12, losses: 8, ties: 6 });
  });

  it("matches the 2026-09-28 NFL spot check and defaults a missing ties stat to 0", () => {
    const records = recordsFromStandings(standingsSchema.parse(nfl2026));
    expect(byId(records, "12")).toMatchObject({ wins: 3, losses: 0 });
    expect(byId(records, "24")).toMatchObject({ wins: 0, losses: 3 });
  });
});

describe("recordFromSchedule (college)", () => {
  const schedule = teamScheduleSchema.parse(arizonaSchedule);

  it("counts conference-tournament games but excludes the NCAA Tournament", () => {
    // Fixture: 2 regular-season losses, 3 regular-season wins, the Big 12 tournament (3 wins,
    // filed by ESPN as regular season) and 5 NCAA Tournament games (4 wins, the Final Four loss).
    expect(recordFromSchedule(schedule, "12")).toEqual({
      espnTeamId: "12",
      wins: 6,
      losses: 2,
      ties: 0,
    });
  });

  it("would report 10-3 if postseason games leaked in, so the filter is doing the work", () => {
    const everythingRegular = {
      events: schedule.events.map((e) => ({ ...e, seasonType: { type: 2 } })),
    };
    expect(recordFromSchedule(everythingRegular, "12")).toMatchObject({ wins: 10, losses: 3 });
  });

  it("ignores games that are not finished and records an equal-score finish as a tie", () => {
    const game = (completed: boolean, a: number, b: number) => ({
      seasonType: { type: 2 },
      competitions: [
        {
          status: { type: { completed } },
          competitors: [
            { score: a, team: { id: "1" } },
            { score: b, team: { id: "2" } },
          ],
        },
      ],
    });
    const record = recordFromSchedule(
      { events: [game(false, 0, 0), game(true, 17, 17), game(true, 20, 10)] },
      "1",
    );
    expect(record).toMatchObject({ wins: 1, losses: 0, ties: 1 });
  });
});

describe("fetchTeamRecords", () => {
  it("refuses a league-wide college fetch instead of hammering ESPN", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}));
    const result = await fetchTeamRecords("ncaab", 2026, { fetchImpl });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_unsupported" } });
    expect(calls).toHaveLength(0);
  });

  it("fetches one schedule per requested college team, in parallel but bounded", async () => {
    let inFlight = 0;
    let peak = 0;
    const { fetchImpl, calls } = scriptedFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return jsonResponse(arizonaSchedule);
    });
    const ids = Array.from({ length: 14 }, (_, i) => String(100 + i));

    const result = await fetchTeamRecords("ncaab", 2026, {
      fetchImpl,
      sleep: noSleep,
      espnTeamIds: [...ids, ids[0] as string],
    });

    expect(calls).toHaveLength(14);
    expect(peak).toBeLessThanOrEqual(6);
    expect(result.ok && result.value.map((r) => r.espnTeamId)).toEqual(ids);
  });

  it("filters a pro standings table to the requested teams", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse(nfl2026));
    const result = await fetchTeamRecords("nfl", 2026, { fetchImpl, espnTeamIds: ["4"] });
    expect(result).toEqual({
      ok: true,
      value: [{ espnTeamId: "4", wins: 2, losses: 1, ties: 0 }],
    });
  });

  it("surfaces a failed team schedule as a typed error", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse({}, 404));
    const result = await fetchTeamRecords("ncaasb", 2026, { fetchImpl, espnTeamIds: ["999999"] });
    expect(result).toMatchObject({ ok: false, error: { code: "espn_not_found" } });
  });
});
