import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_NODES,
  REMATCH_WEEKS,
  pairByStandings,
  searchRematchFreeSlate,
  type RecentPair,
} from "./pair-by-standings";

const ranked = (...ids: string[]) => ids.map((teamId) => ({ teamId }));
const pairsOf = (result: ReturnType<typeof pairByStandings>) =>
  result.pairs.map((p) => `${p.homeTeamId}-${p.awayTeamId}`);

describe("pairByStandings", () => {
  it("pairs plain neighbors with the better-ranked team at home", () => {
    const result = pairByStandings(ranked("a", "b", "c", "d"), []);
    expect(pairsOf(result)).toEqual(["a-b", "c-d"]);
    expect(result.bye).toBeNull();
  });

  it("skips a recent opponent and plays the next team down", () => {
    const result = pairByStandings(ranked("a", "b", "c", "d"), [["a", "b"]]);
    // a skips b and meets c; b then meets d.
    expect(pairsOf(result)).toEqual(["a-c", "b-d"]);
  });

  it("skips several places when several teams below are recent opponents", () => {
    const recent: RecentPair[] = [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
    ];
    const result = pairByStandings(ranked("a", "b", "c", "d", "e", "f"), recent);
    expect(pairsOf(result)).toEqual(["a-e", "b-c", "d-f"]);
  });

  it("reads a recent pair in either order", () => {
    expect(pairsOf(pairByStandings(ranked("a", "b", "c", "d"), [["b", "a"]]))).toEqual([
      "a-c",
      "b-d",
    ]);
  });

  it("backs up and re-pairs the top when the bottom would otherwise be a rematch", () => {
    // Greedy would play a-b and strand c-d, who just met. The search gives a its next fresh
    // opponent instead, so nobody replays.
    const result = pairByStandings(ranked("a", "b", "c", "d"), [["c", "d"]]);
    expect(pairsOf(result)).toEqual(["a-c", "b-d"]);
  });

  it("keeps an odd field's bye deterministic: the team left with nobody below it", () => {
    const result = pairByStandings(ranked("a", "b", "c", "d", "e"), [
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(pairsOf(result)).toEqual(["a-c", "b-d"]);
    expect(result.bye).toBe("e");
  });

  it("falls back to the nearest team when every team left is a recent opponent", () => {
    // a has met b and c, the only teams left, so it plays b anyway.
    const result = pairByStandings(ranked("a", "b", "c", "d"), [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
    ]);
    expect(pairsOf(result)).toEqual(["a-b", "c-d"]);
  });

  it("falls back to the greedy slate when no rematch-free slate exists, and still pairs everyone", () => {
    // Four teams that have all met inside the window: every possible slate is a rematch.
    const allMet: RecentPair[] = [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
    ];
    const field = ranked("a", "b", "c", "d");
    expect(
      searchRematchFreeSlate(["a", "b", "c", "d"], new Set(allMet.map(([x, y]) => `${x}|${y}`)))
        .slate,
    ).toBeNull();
    expect(pairsOf(pairByStandings(field, allMet))).toEqual(["a-b", "c-d"]);
  });

  it("takes the fallback for a two-team field that just played", () => {
    const result = pairByStandings(ranked("a", "b"), [["a", "b"]]);
    expect(pairsOf(result)).toEqual(["a-b"]);
    expect(result.bye).toBeNull();
  });

  it("leaves the last unpaired team of an odd field on a bye", () => {
    const result = pairByStandings(ranked("a", "b", "c", "d", "e"), []);
    expect(pairsOf(result)).toEqual(["a-b", "c-d"]);
    expect(result.bye).toBe("e");
  });

  it("can leave a mid-table team as the bye when the guard moves its neighbor away", () => {
    const result = pairByStandings(ranked("a", "b", "c"), [["a", "b"]]);
    expect(pairsOf(result)).toEqual(["a-c"]);
    expect(result.bye).toBe("b");
  });

  it("handles zero and one team", () => {
    expect(pairByStandings([], [])).toEqual({ pairs: [], bye: null });
    expect(pairByStandings(ranked("a"), [])).toEqual({ pairs: [], bye: "a" });
  });

  it("does not depend on the order of the recent pairs", () => {
    const recent: RecentPair[] = [
      ["a", "b"],
      ["c", "d"],
      ["b", "c"],
      ["a", "e"],
    ];
    const teams = ranked("a", "b", "c", "d", "e", "f");
    const forward = pairByStandings(teams, recent);
    expect(pairByStandings(teams, [...recent].reverse())).toEqual(forward);
    expect(
      pairByStandings(
        teams,
        recent.map(([x, y]): RecentPair => [y, x]),
      ),
    ).toEqual(forward);
  });

  it("ignores recent pairs that name teams outside the field", () => {
    expect(pairsOf(pairByStandings(ranked("a", "b"), [["a", "ghost"]]))).toEqual(["a-b"]);
  });

  it("puts every team in at most one slot, even with a repeated id", () => {
    const field = ranked("a", "b", "c", "d", "e", "f", "g", "a", "b");
    const result = pairByStandings(field, [
      ["a", "b"],
      ["a", "c"],
      ["d", "e"],
    ]);
    const used = [...result.pairs.flatMap((p) => [p.homeTeamId, p.awayTeamId]), result.bye].filter(
      (id): id is string => id !== null,
    );
    expect(new Set(used).size).toBe(used.length);
    expect(used.sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(result.pairs.every((p) => p.homeTeamId !== p.awayTeamId)).toBe(true);
  });
});

describe("pairByStandings over many weeks", () => {
  // mulberry32: a tiny seeded generator, so the simulation is the same on every run.
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const TEAMS = 20;
  const WEEKS = 30;
  const WINDOW_CEILING_GAP = 8;

  /** Plays `WEEKS` weeks and reports what the rules promise. `swapChance` is how restless the table is. */
  function simulate(seed: number, swapChance: number) {
    const random = seeded(seed);
    let order = Array.from({ length: TEAMS }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const history: RecentPair[][] = [];
    let rematches = 0;
    let maxGap = 0;
    let maxNodes = 0;

    for (let week = 0; week < WEEKS; week += 1) {
      const recentPairs = history.slice(-REMATCH_WEEKS).flat();
      const recent = new Set(recentPairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
      maxNodes = Math.max(maxNodes, searchRematchFreeSlate(order, recent).nodes);

      const result = pairByStandings(
        order.map((teamId) => ({ teamId })),
        recentPairs,
      );
      const rankOf = new Map(order.map((id, i) => [id, i]));
      const used = result.pairs.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
      expect(used.slice().sort()).toEqual(order.slice().sort());
      expect(result.bye).toBeNull();

      for (const { homeTeamId, awayTeamId } of result.pairs) {
        const home = rankOf.get(homeTeamId) ?? -1;
        const away = rankOf.get(awayTeamId) ?? -1;
        expect(home).toBeLessThan(away);
        maxGap = Math.max(maxGap, away - home);
        if (
          recent.has(
            homeTeamId < awayTeamId ? `${homeTeamId}|${awayTeamId}` : `${awayTeamId}|${homeTeamId}`,
          )
        ) {
          rematches += 1;
        }
      }
      history.push(result.pairs.map((p): RecentPair => [p.homeTeamId, p.awayTeamId]));

      // The table drifts: neighbors trade places now and then.
      order = [...order];
      for (let i = 0; i < order.length - 1; i += 1) {
        if (random() < swapChance) {
          [order[i], order[i + 1]] = [order[i + 1] as string, order[i] as string];
        }
      }
    }
    return { rematches, maxGap, maxNodes };
  }

  it.each([
    ["frozen standings", 0],
    ["a slowly drifting table", 0.1],
    ["a restless table", 0.4],
  ])("pairs every team once a week with no rematch and a small rank gap: %s", (_name, swap) => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { rematches, maxGap, maxNodes } = simulate(seed, swap);
      expect(rematches).toBe(0);
      expect(maxGap).toBeLessThanOrEqual(WINDOW_CEILING_GAP);
      expect(maxNodes).toBeLessThan(MAX_SEARCH_NODES);
    }
  });
});
