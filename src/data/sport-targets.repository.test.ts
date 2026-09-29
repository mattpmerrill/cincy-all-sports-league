import { describe, expect, it } from "vitest";
import type { DbClient } from "./db-client";
import { createSportTargetsRepository } from "./sport-targets.repository";

type Result = { data: unknown; error: null };
type Query = {
  select: () => Query;
  eq: () => Query;
  in: (column: string, values: string[]) => Query;
  order: () => Query;
  range: () => Query;
  maybeSingle: () => Promise<Result>;
  then: (resolve: (value: Result) => unknown) => unknown;
};

function query(result: Result, onIn?: (column: string, values: string[]) => void): Query {
  const q: Query = {
    select: () => q,
    eq: () => q,
    in: (column, values) => {
      onIn?.(column, values);
      return q;
    },
    order: () => q,
    range: () => q,
    maybeSingle: async () => result,
    then: (resolve) => resolve(result),
  };
  return q;
}

const participant = (id: string, sport: string, name: string) => ({
  id,
  sport_id: sport,
  name,
  short_name: name,
  espn_id: `e-${id}`,
});

function fakeDb(poolFilter: string[][] = []) {
  const tables: Record<string, () => Query> = {
    seasons: () => query({ data: { id: "season", ends_on: "2027-11-15" }, error: null }),
    season_sports: () =>
      query({
        data: [
          {
            starts_on: "2026-09-01",
            ends_on: null,
            espn_season: 2026,
            sports: { id: "s-mlb", code: "mlb" },
          },
          {
            starts_on: "2026-09-01",
            ends_on: null,
            espn_season: 2026,
            sports: { id: "s-nba", code: "nba" },
          },
        ],
        error: null,
      }),
    scoring_rules: () => query({ data: [], error: null }),
    picks: () =>
      query({
        data: [
          {
            id: "k1",
            sport_id: "s-mlb",
            participants: participant("m1", "s-mlb", "Mets"),
            fantasy_teams: {},
          },
          // The same participant picked by a second team appears once.
          {
            id: "k2",
            sport_id: "s-mlb",
            participants: participant("m1", "s-mlb", "Mets"),
            fantasy_teams: {},
          },
        ],
        error: null,
      }),
    participants: () =>
      query(
        {
          data: [
            participant("m3", "s-mlb", "Yankees"),
            participant("m1", "s-mlb", "Mets"),
            participant("m2", "s-mlb", "Braves"),
            participant("n1", "s-nba", "Bulls"),
          ],
          error: null,
        },
        (_column, values) => poolFilter.push(values),
      ),
  };
  return {
    db: {
      from: (table: string) => {
        const make = tables[table];
        if (!make) throw new Error(`unexpected table ${table}`);
        return make();
      },
    } as unknown as DbClient,
  };
}

describe("listSportTargets", () => {
  it("splits each sport into held participants and the free agents nobody holds", async () => {
    const { db } = fakeDb();
    const [mlb, nba] = await createSportTargetsRepository(db).listSportTargets();

    // `participants` stays held-only: the admin results editor lists exactly these.
    expect(mlb?.participants.map((p) => p.name)).toEqual(["Mets"]);
    expect(mlb?.freeAgents?.map((p) => p.name)).toEqual(["Braves", "Yankees"]);
    expect(mlb?.freeAgents?.[0]).toEqual({
      id: "m2",
      name: "Braves",
      shortName: "Braves",
      externalId: "e-m2",
    });
    // Another sport's participants never leak in, and a sport with no picks is all free agents.
    expect(nba?.participants).toEqual([]);
    expect(nba?.freeAgents?.map((p) => p.name)).toEqual(["Bulls"]);
  });

  it("only reads the pool of the sports asked for", async () => {
    const filters: string[][] = [];
    const { db } = fakeDb(filters);
    await createSportTargetsRepository(db).listSportTargets(["mlb"]);
    expect(filters).toEqual([["s-mlb"]]);
  });
});
