import { describe, expect, it } from "vitest";
import type { BreakdownLine } from "@/domain/scoring";
import { freeAgentStatLine } from "./stats";

const line = (over: Partial<BreakdownLine>): BreakdownLine => ({
  kind: "per_win",
  ruleId: "r",
  label: "Win",
  quantity: 1,
  rate: 2,
  eventLabel: null,
  points: 0,
  ...over,
});

describe("freeAgentStatLine", () => {
  it("counts wins for a team sport, singular for one", () => {
    expect(freeAgentStatLine({ lines: [line({ quantity: 12 })] })).toBe("12 wins");
    expect(freeAgentStatLine({ lines: [line({ quantity: 1 })] })).toBe("1 win");
  });

  it("adds ties when the sport scores them", () => {
    expect(
      freeAgentStatLine({
        lines: [line({ quantity: 12 }), line({ kind: "per_tie", quantity: 3 })],
      }),
    ).toBe("12 wins, 3 ties");
  });

  it("shows an athlete's rank", () => {
    expect(
      freeAgentStatLine({
        lines: [line({ kind: "final_rank_band", label: "Top 25", quantity: 14, rate: null })],
      }),
    ).toBe("Rank 14");
  });

  it("is null when nothing has been counted, including playoff-only lines", () => {
    expect(freeAgentStatLine({ lines: [] })).toBeNull();
    expect(
      freeAgentStatLine({ lines: [line({ kind: "playoff_milestone", rate: null, points: 20 })] }),
    ).toBeNull();
  });
});
