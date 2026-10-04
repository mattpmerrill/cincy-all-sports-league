import { describe, expect, it } from "vitest";
import { pairByStandings, type RecentPair } from "./pair-by-standings";

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

  it("falls back to the nearest team when every team left is a recent opponent", () => {
    // a has met b and c, the only teams left, so it plays b anyway.
    const result = pairByStandings(ranked("a", "b", "c", "d"), [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
    ]);
    expect(pairsOf(result)).toEqual(["a-b", "c-d"]);
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
