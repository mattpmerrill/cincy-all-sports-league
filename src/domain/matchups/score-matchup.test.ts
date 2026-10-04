import { describe, expect, it } from "vitest";
import { matchup } from "./fixtures";
import { matchupStatus, scoreMatchup } from "./score-matchup";

const totals = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("scoreMatchup, live", () => {
  it("scores each side as its current total minus its frozen start total", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20] });
    expect(scoreMatchup(m, totals({ a: 14.5, b: 21 }))).toEqual({
      state: "live",
      home: { teamId: "a", gain: 4.5 },
      away: { teamId: "b", gain: 1 },
      leader: "home",
    });
  });

  it("calls the away side the leader when it has gained more", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20] });
    expect(scoreMatchup(m, totals({ a: 10, b: 23 })).leader).toBe("away");
  });

  it("is tied at 0 to 0 and at any equal gain", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20] });
    expect(scoreMatchup(m, totals({ a: 10, b: 20 })).leader).toBe("tied");
    expect(scoreMatchup(m, totals({ a: 12, b: 22 })).leader).toBe("tied");
  });

  it("does not let float drift invent a leader", () => {
    // 0.1 + 0.2 is 0.30000000000000004 as a double; both sides gained exactly 0.3.
    const m = matchup("2026-10-05", "a", "b", { start: [0, 0.3] });
    const scored = scoreMatchup(m, totals({ a: 0.1 + 0.2, b: 0.6 }));
    expect(scored.leader).toBe("tied");
    expect(scored.home.gain).toBe(0.3);
    expect(scored.away.gain).toBe(0.3);
  });

  it("handles a negative gain from a corrected result", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20] });
    const scored = scoreMatchup(m, totals({ a: 8.5, b: 20 }));
    expect(scored.home.gain).toBe(-1.5);
    expect(scored.leader).toBe("away");
  });

  it("gives a null gain and no leader when a team is missing from the current totals", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20] });
    expect(scoreMatchup(m, totals({ a: 12 }))).toEqual({
      state: "live",
      home: { teamId: "a", gain: 2 },
      away: { teamId: "b", gain: null },
      leader: null,
    });
    expect(scoreMatchup(m, totals({}))).toMatchObject({
      home: { gain: null },
      away: { gain: null },
      leader: null,
    });
  });

  it("treats a non-finite current total as unknown, never as NaN", () => {
    const m = matchup("2026-10-05", "a", "b");
    const scored = scoreMatchup(m, totals({ a: Number.NaN, b: 3 }));
    expect(scored.home.gain).toBeNull();
    expect(scored.leader).toBeNull();
  });
});

describe("scoreMatchup, final", () => {
  it("scores from the frozen end totals and names a winner and a loser", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [15, 22] });
    expect(scoreMatchup(m, totals({}))).toEqual({
      state: "final",
      home: { teamId: "a", gain: 5, result: "win" },
      away: { teamId: "b", gain: 2, result: "loss" },
      leader: "home",
    });
  });

  it("gives the win to the away side when it gained more", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [11, 30] });
    const scored = scoreMatchup(m, totals({}));
    expect(scored.state === "final" && [scored.home.result, scored.away.result]).toEqual([
      "loss",
      "win",
    ]);
  });

  it("is a tie for both sides on equal gains, including 0 to 0", () => {
    const quiet = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [10, 20] });
    const level = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [13, 23] });
    for (const m of [quiet, level]) {
      const scored = scoreMatchup(m, totals({}));
      expect(scored).toMatchObject({
        state: "final",
        home: { result: "tie" },
        away: { result: "tie" },
        leader: "tied",
      });
    }
  });

  it("can have a winner with a negative gain", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [9, 18] });
    const scored = scoreMatchup(m, totals({}));
    expect(scored).toMatchObject({
      home: { gain: -1, result: "win" },
      away: { gain: -2, result: "loss" },
    });
  });

  it("ignores current totals once final, so a later correction cannot rewrite the week", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [10, 20], end: [15, 22] });
    expect(scoreMatchup(m, totals({ a: 99, b: 0 }))).toEqual(scoreMatchup(m, totals({})));
  });

  it("does not let float drift decide a final result", () => {
    const m = matchup("2026-10-05", "a", "b", { start: [0, 0.3], end: [0.1 + 0.2, 0.6] });
    expect(scoreMatchup(m, totals({})).leader).toBe("tied");
  });
});

describe("matchupStatus", () => {
  it("is final only when both end totals exist", () => {
    expect(matchupStatus(matchup("2026-10-05", "a", "b"))).toBe("live");
    expect(matchupStatus(matchup("2026-10-05", "a", "b", { end: [1, 2] }))).toBe("final");
  });
});
