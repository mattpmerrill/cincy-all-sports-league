import { describe, expect, it, vi } from "vitest";
import { MATCHUP_ERROR_CODES, MATCHUP_MESSAGES } from "@/domain/matchups";
import type { DbClient } from "./db-client";
import {
  createMatchupsRepository,
  toMatchup,
  toMatchupError,
  type MatchupRow,
  type RollWeekInput,
} from "./matchups.repository";

type Row = Record<string, unknown>;

type Recorded = { orders: [string, unknown][]; ranges: [number, number][] };

/**
 * A thenable query builder over in-memory tables: applies the equality and date filters and the
 * page window the repository uses, and records the ordering columns and ranges it was given, so a
 * missing `order` (paging then loses rows) or a missing `range` (a silent 1000-row cap) shows up.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const recorded: Recorded = { orders: [], ranges: [] };
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let window: [number, number] | null = null;
    const query = {
      select: () => query,
      order: (column: string, options: unknown) => {
        recorded.orders.push([column, options]);
        return query;
      },
      range: (first: number, last: number) => {
        recorded.ranges.push([first, last]);
        window = [first, last];
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      gte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) >= value);
        return query;
      },
      lt: (column: string, value: string) => {
        filters.push((row) => String(row[column]) < value);
        return query;
      },
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) => {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        resolve({ data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null });
      },
    };
    return query;
  };
  return { db: { from } as unknown as DbClient, recorded };
}

const row = (overrides: Partial<MatchupRow> = {}): MatchupRow => ({
  id: "m1",
  season_id: "season-1",
  week_start: "2026-10-05",
  home_team_id: "a",
  away_team_id: "b",
  home_start_points: 10.5,
  away_start_points: 20,
  home_end_points: null,
  away_end_points: null,
  created_at: "2026-10-05T10:45:00+00:00",
  finalized_at: null,
  ...overrides,
});

describe("toMatchup", () => {
  it("maps a live row and keeps the database's rows out of the domain type", () => {
    expect(toMatchup(row())).toEqual({
      id: "m1",
      seasonId: "season-1",
      weekStart: "2026-10-05",
      home: { teamId: "a", startPoints: 10.5, endPoints: null },
      away: { teamId: "b", startPoints: 20, endPoints: null },
      finalizedAt: null,
    });
  });

  it("maps a final row, with the close time as an ISO instant", () => {
    const m = toMatchup(
      row({
        home_end_points: 15,
        away_end_points: 22.25,
        finalized_at: "2026-10-12T10:45:00+00:00",
      }),
    );
    expect(m.home.endPoints).toBe(15);
    expect(m.away.endPoints).toBe(22.25);
    expect(m.finalizedAt).toBe("2026-10-12T10:45:00.000Z");
  });

  it("fails loudly on a row with an end total for only one side", () => {
    expect(() => toMatchup(row({ home_end_points: 1 }))).toThrow(/only one side/);
    expect(() => toMatchup(row({ away_end_points: 1 }))).toThrow(/only one side/);
  });
});

describe("listSeason", () => {
  it("returns only the season's matchups as domain values", async () => {
    const { db } = fakeDb({
      matchups: [
        row({ id: "m1" }),
        row({ id: "m2", season_id: "season-2" }),
        row({ id: "m3", week_start: "2026-10-12" }),
      ],
    });
    const matchups = await createMatchupsRepository(db).listSeason("season-1");
    expect(matchups.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(matchups[0]).not.toHaveProperty("season_id");
  });
});

describe("listSeason paging and order", () => {
  it("orders by week then id (a total order, which paging needs) and asks for the first page", async () => {
    const { db, recorded } = fakeDb({ matchups: [row()] });
    await createMatchupsRepository(db).listSeason("season-1");
    expect(recorded.orders).toEqual([
      ["week_start", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(recorded.ranges).toEqual([[0, 999]]);
  });

  it("walks to a second page instead of stopping at the 1000-row cap", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => row({ id: `m${i}` }));
    const { db, recorded } = fakeDb({ matchups: many });
    const matchups = await createMatchupsRepository(db).listSeason("season-1");
    expect(matchups).toHaveLength(1001);
    expect(recorded.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("listRecentPairs", () => {
  const { db } = fakeDb({
    matchups: [
      row({ id: "m1", week_start: "2026-09-14", home_team_id: "a", away_team_id: "b" }),
      row({ id: "m2", week_start: "2026-09-21", home_team_id: "c", away_team_id: "d" }),
      row({ id: "m3", week_start: "2026-09-28", home_team_id: "e", away_team_id: "f" }),
      row({ id: "m4", week_start: "2026-10-05", home_team_id: "g", away_team_id: "h" }),
      row({ id: "m5", week_start: "2026-09-21", season_id: "season-2" }),
    ],
  });

  it("covers the weeks before the given one, that week excluded, as home-away pairs", async () => {
    // Three weeks before Oct 5 is Sep 14: week Sep 14 up to, but not including, Oct 5.
    const pairs = await createMatchupsRepository(db).listRecentPairs("season-1", "2026-10-05", 3);
    expect(pairs).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("does not reach past the window or into another season", async () => {
    const pairs = await createMatchupsRepository(db).listRecentPairs("season-1", "2026-10-05", 1);
    expect(pairs).toEqual([["e", "f"]]);
  });

  it("orders by week then id and pages like the season read", async () => {
    const { db: recording, recorded } = fakeDb({ matchups: [row()] });
    await createMatchupsRepository(recording).listRecentPairs("season-1", "2026-10-05", 3);
    expect(recorded.orders.map(([column]) => column)).toEqual(["week_start", "id"]);
    expect(recorded.ranges).toEqual([[0, 999]]);
  });

  it("is empty before any matchups exist", async () => {
    const pairs = await createMatchupsRepository(db).listRecentPairs("season-1", "2026-09-14", 3);
    expect(pairs).toEqual([]);
  });
});

describe("toMatchupError", () => {
  const raised = (message: string) => ({ code: "P0001", message });

  it("maps every token the function raises to its code with a readable message", () => {
    for (const code of MATCHUP_ERROR_CODES) {
      expect(toMatchupError(raised(code))).toEqual({ code, message: MATCHUP_MESSAGES[code] });
    }
  });

  it("does not claim errors it does not own", () => {
    expect(toMatchupError({ code: "42501", message: "duplicate_team" })).toBeNull();
    expect(toMatchupError(raised("something else"))).toBeNull();
    expect(toMatchupError({ code: "23503", message: "violates foreign key" })).toBeNull();
  });
});

describe("rollWeek", () => {
  const stub = (result: { data?: unknown; error?: unknown }) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
    return { rpc, repo: createMatchupsRepository({ rpc } as unknown as DbClient) };
  };
  const input: RollWeekInput = {
    seasonId: "season-1",
    weekStart: "2026-10-12",
    finals: [
      { teamId: "a", points: 14.5 },
      { teamId: "b", points: 21 },
    ],
    pairings: [{ homeTeamId: "a", awayTeamId: "b", homeStartPoints: 14.5, awayStartPoints: 21 }],
  };

  it("calls the function with the exact parameter names and snake_case rows", async () => {
    const { rpc, repo } = stub({ data: { rolled: true, finalized: 2, created: 1 } });
    expect(await repo.rollWeek(input)).toEqual({
      ok: true,
      value: { rolled: true, finalized: 2, created: 1 },
    });
    expect(rpc).toHaveBeenCalledWith("roll_matchup_week", {
      p_season_id: "season-1",
      p_week_start: "2026-10-12",
      p_finals: [
        { team_id: "a", points: 14.5 },
        { team_id: "b", points: 21 },
      ],
      p_pairings: [
        {
          home_team_id: "a",
          away_team_id: "b",
          home_start_points: 14.5,
          away_start_points: 21,
        },
      ],
    });
  });

  it("sends an empty pairings array for a close-only call", async () => {
    const { rpc, repo } = stub({ data: { rolled: true, finalized: 10, created: 0 } });
    await repo.rollWeek({ ...input, pairings: [] });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_pairings: [] });
  });

  it("rounds points to the four decimals the column stores, so float drift never travels", async () => {
    const { rpc, repo } = stub({ data: { rolled: false, finalized: 0, created: 0 } });
    await repo.rollWeek({
      ...input,
      finals: [{ teamId: "a", points: 0.1 + 0.2 }],
      pairings: [
        { homeTeamId: "a", awayTeamId: "b", homeStartPoints: 0.1 + 0.2, awayStartPoints: 30.12345 },
      ],
    });
    const args = rpc.mock.calls[0]?.[1] as {
      p_finals: { points: number }[];
      p_pairings: { home_start_points: number; away_start_points: number }[];
    };
    expect(args.p_finals[0]?.points).toBe(0.3);
    expect(args.p_pairings[0]?.home_start_points).toBe(0.3);
    expect(args.p_pairings[0]?.away_start_points).toBe(30.1235);
  });

  it("returns rolled false when the week already had rows", async () => {
    const { repo } = stub({ data: { rolled: false, finalized: 0, created: 0 } });
    expect(await repo.rollWeek(input)).toEqual({
      ok: true,
      value: { rolled: false, finalized: 0, created: 0 },
    });
  });

  it("returns a typed failure for a token", async () => {
    const { repo } = stub({ error: { code: "P0001", message: "duplicate_team", details: "" } });
    expect(await repo.rollWeek(input)).toEqual({
      ok: false,
      error: { code: "duplicate_team", message: MATCHUP_MESSAGES.duplicate_team },
    });
  });

  it("throws anything it cannot map, so an outage is never a user error", async () => {
    const boom = { code: "42501", message: "permission denied for function", details: "" };
    const { repo } = stub({ error: boom });
    await expect(repo.rollWeek(input)).rejects.toBe(boom);
  });

  it("throws when the reply is not the documented shape", async () => {
    await expect(stub({ data: { rolled: "yes" } }).repo.rollWeek(input)).rejects.toThrow();
    await expect(stub({ data: null }).repo.rollWeek(input)).rejects.toThrow();
    await expect(
      stub({ data: { rolled: true, finalized: -1, created: 0 } }).repo.rollWeek(input),
    ).rejects.toThrow();
  });
});
