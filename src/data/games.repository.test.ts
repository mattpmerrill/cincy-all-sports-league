import { describe, expect, it } from "vitest";
import { GAME_STATUSES } from "@/domain/schedule";
import { Constants } from "./database.types";
import type { DbClient } from "./db-client";
import {
  createGamesRepository,
  toGame,
  type GameReadRow,
  type GameWrite,
} from "./games.repository";

type Row = Record<string, unknown>;

/**
 * A thenable query builder over in-memory tables: records filters and upserts, so the repository
 * can be exercised without a database. Only the calls the repository makes are modelled.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const upserts: { table: string; rows: Row[]; options: unknown }[] = [];
  const lookups: { table: string; column: string; size: number }[] = [];

  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      select: () => query,
      // Ordering, paging and the time bounds are query-builder details with nothing to assert here.
      order: () => query,
      range: () => query,
      gte: () => query,
      lt: () => query,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: readonly unknown[]) => {
        lookups.push({ table, column, size: values.length });
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      upsert: async (rows: Row[], options: unknown) => {
        upserts.push({ table, rows, options });
        return { error: null };
      },
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
        resolve({
          data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
          error: null,
        }),
    };
    return query;
  };
  return { db: { from } as unknown as DbClient, upserts, lookups };
}

const side = (id: string, score: number | null = null) => ({
  externalId: id,
  name: `Team ${id}`,
  shortName: id,
  score,
  winner: null,
});

const write = (externalId: string, overrides: Partial<GameWrite> = {}): GameWrite => ({
  externalId,
  startsAt: new Date("2026-10-04T17:00:00Z"),
  timeTbd: false,
  status: "scheduled",
  statusDetail: null,
  note: null,
  neutralSite: false,
  home: side("23"),
  away: side("4"),
  ...overrides,
});

const target = { seasonId: "season-1", sportId: "nfl-id" };
const participants = [
  { id: "p-pit", sport_id: "nfl-id", espn_id: "23" },
  { id: "p-cin", sport_id: "nfl-id", espn_id: "4" },
  // Same ESPN id in another sport must never be picked up.
  { id: "p-other", sport_id: "nba-id", espn_id: "23" },
];

/** The stored form of write("e1") as Postgres returns it (timestamp with +00:00). */
const stored = (overrides: Row = {}): Row => ({
  id: "g1",
  season_id: "season-1",
  sport_id: "nfl-id",
  external_id: "e1",
  starts_at: "2026-10-04T17:00:00+00:00",
  time_tbd: false,
  status: "scheduled",
  status_detail: null,
  note: null,
  neutral_site: false,
  home_external_id: "23",
  home_participant_id: "p-pit",
  home_name: "Team 23",
  home_short_name: "23",
  home_score: null,
  home_winner: null,
  away_external_id: "4",
  away_participant_id: "p-cin",
  away_name: "Team 4",
  away_short_name: "4",
  away_score: null,
  away_winner: null,
  ...overrides,
});

describe("upsertGames", () => {
  it("maps each side's vendor id to this sport's participant and upserts on (sport, event id)", async () => {
    const { db, upserts } = fakeDb({ participants, games: [] });
    const summary = await createGamesRepository(db).upsertGames(target, [write("e1")]);

    expect(summary).toEqual({ inserted: 1, updated: 0, unchanged: 0, unmappedSides: 0 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.options).toEqual({ onConflict: "sport_id,external_id" });
    expect(upserts[0]?.rows[0]).toMatchObject({
      season_id: "season-1",
      sport_id: "nfl-id",
      external_id: "e1",
      starts_at: "2026-10-04T17:00:00.000Z",
      home_participant_id: "p-pit",
      away_participant_id: "p-cin",
    });
  });

  it("keeps a team the league has no row for by name, with a null participant", async () => {
    const { db, upserts } = fakeDb({ participants, games: [] });
    const summary = await createGamesRepository(db).upsertGames(target, [
      write("e1", { away: side("999") }),
    ]);
    expect(summary.unmappedSides).toBe(1);
    expect(upserts[0]?.rows[0]).toMatchObject({
      away_participant_id: null,
      away_external_id: "999",
      away_name: "Team 999",
    });
  });

  it("writes nothing when the stored game already matches (a quiet 30-minute run)", async () => {
    const { db, upserts } = fakeDb({ participants, games: [stored()] });
    const summary = await createGamesRepository(db).upsertGames(target, [write("e1")]);
    expect(summary).toEqual({ inserted: 0, updated: 0, unchanged: 1, unmappedSides: 0 });
    expect(upserts).toHaveLength(0);
  });

  it("writes a game whose score, status, kickoff or participant changed, and only that game", async () => {
    const { db, upserts } = fakeDb({
      participants,
      games: [stored(), stored({ id: "g2", external_id: "e2" })],
    });
    const summary = await createGamesRepository(db).upsertGames(target, [
      write("e1", {
        status: "in_progress",
        statusDetail: "Q1 3:00",
        home: side("23", 7),
        away: side("4", 3),
      }),
      write("e2"),
    ]);
    expect(summary).toMatchObject({ updated: 1, unchanged: 1, inserted: 0 });
    expect(upserts[0]?.rows.map((r) => r.external_id)).toEqual(["e1"]);
    expect(upserts[0]?.rows[0]).toMatchObject({
      status: "in_progress",
      home_score: 7,
      away_score: 3,
    });
  });

  it("notices a rescheduled kickoff and a participant that was missing and now exists", async () => {
    const { db } = fakeDb({
      participants,
      games: [stored({ away_participant_id: null }), stored({ id: "g3", external_id: "e3" })],
    });
    const summary = await createGamesRepository(db).upsertGames(target, [
      write("e1"), // away participant now resolvable
      write("e3", { startsAt: new Date("2026-10-04T20:25:00Z") }),
    ]);
    expect(summary).toMatchObject({ updated: 2, unchanged: 0 });
  });

  it("collapses a repeated event in one batch to one row", async () => {
    const { db, upserts } = fakeDb({ participants, games: [] });
    await createGamesRepository(db).upsertGames(target, [
      write("e1"),
      write("e1", { status: "final", home: side("23", 3), away: side("4", 1) }),
    ]);
    expect(upserts[0]?.rows).toHaveLength(1);
    expect(upserts[0]?.rows[0]).toMatchObject({ status: "final", home_score: 3 });
  });

  it("looks ids up 100 at a time and upserts 200 rows at a time", async () => {
    const many = Array.from({ length: 450 }, (_, i) =>
      write(`e${i}`, { home: side(`h${i}`), away: side(`a${i}`) }),
    );
    const { db, upserts, lookups } = fakeDb({ participants: [], games: [] });
    await createGamesRepository(db).upsertGames(target, many);

    expect(Math.max(...lookups.map((l) => l.size))).toBe(100);
    expect(upserts.map((u) => u.rows.length)).toEqual([200, 200, 50]);
  });

  it("does nothing for an empty list", async () => {
    const { db, upserts, lookups } = fakeDb({});
    expect(await createGamesRepository(db).upsertGames(target, [])).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      unmappedSides: 0,
    });
    expect(upserts).toHaveLength(0);
    expect(lookups).toHaveLength(0);
  });

  it("throws the database error rather than reporting a partial write as success", async () => {
    const db = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          upsert: async () => ({ error: new Error("boom") }),
          then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }),
        };
        return query;
      },
    } as unknown as DbClient;
    await expect(createGamesRepository(db).upsertGames(target, [write("e1")])).rejects.toThrow(
      "boom",
    );
  });
});

describe("toGame", () => {
  const row = {
    ...stored({
      status: "final",
      home_score: 27,
      away_score: 24,
      home_winner: true,
      away_winner: false,
    }),
    home: { logo_url: "https://logo/pit.png" },
    away: null,
  } as unknown as GameReadRow;

  it("maps a stored row to the domain game, normalising the instant and reading logos from the embed", () => {
    expect(toGame(row, "nfl")).toEqual({
      id: "g1",
      sport: "nfl",
      externalId: "e1",
      startsAt: "2026-10-04T17:00:00.000Z",
      timeTbd: false,
      status: "final",
      statusDetail: null,
      note: null,
      neutralSite: false,
      home: {
        externalId: "23",
        participantId: "p-pit",
        name: "Team 23",
        shortName: "23",
        logoUrl: "https://logo/pit.png",
        score: 27,
        winner: true,
      },
      away: {
        externalId: "4",
        participantId: "p-cin",
        name: "Team 4",
        shortName: "4",
        logoUrl: null,
        score: 24,
        winner: false,
      },
    });
  });
});

describe("listBetween", () => {
  it("looks the sport up by id and fails loudly on a game whose sport the catalog lacks", async () => {
    const readRow = { ...stored(), home: null, away: null };
    const known = fakeDb({ games: [readRow], sports: [{ id: "nfl-id", code: "nfl" }] });
    const games = await createGamesRepository(known.db).listBetween(
      "season-1",
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-08T00:00:00Z"),
    );
    expect(games.map((g) => [g.id, g.sport])).toEqual([["g1", "nfl"]]);

    const drifted = fakeDb({ games: [readRow], sports: [{ id: "other", code: "nba" }] });
    await expect(
      createGamesRepository(drifted.db).listBetween("season-1", new Date(0), new Date(1)),
    ).rejects.toThrow(/unknown sport/);
  });
});

describe("the game_status enum", () => {
  it("lists exactly the domain's GAME_STATUSES, in the same order", () => {
    expect([...Constants.public.Enums.game_status]).toEqual([...GAME_STATUSES]);
  });
});
