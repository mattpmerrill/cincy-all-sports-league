import { describe, expect, it } from "vitest";
import type { BreakdownLine } from "@/domain/scoring";
import { describeBreakdownLine } from "./describe-breakdown";

const line = (over: Partial<BreakdownLine>): BreakdownLine => ({
  kind: "per_win",
  ruleId: "r",
  label: "Win",
  quantity: 1,
  rate: null,
  eventLabel: null,
  points: 0,
  ...over,
});

describe("describeBreakdownLine", () => {
  it("shows wins and ties as count times rate, singular for one", () => {
    expect(describeBreakdownLine(line({ quantity: 4, rate: 4.1, points: 16.4 })).text).toBe(
      "4 wins × 4.1",
    );
    expect(describeBreakdownLine(line({ quantity: 1, rate: 3, points: 3 })).text).toBe("1 win × 3");
    expect(
      describeBreakdownLine(line({ kind: "per_tie", quantity: 2, rate: 1.5, points: 3 })).text,
    ).toBe("2 ties × 1.5");
  });

  it("prefixes major finishes with the event and flags the cap as an adjustment", () => {
    const major = describeBreakdownLine(
      line({
        kind: "major_finish",
        label: "Grand Slam semifinal",
        eventLabel: "US Open",
        points: 5,
      }),
    );
    expect(major.text).toBe("US Open: Grand Slam semifinal");
    expect(major.isAdjustment).toBe(false);

    const cap = describeBreakdownLine(
      line({ kind: "major_cap", label: "Majors capped at 50", points: -12.5 }),
    );
    expect(cap).toEqual({ text: "Majors capped at 50", points: -12.5, isAdjustment: true });
  });

  it("passes milestone and rank labels straight through", () => {
    expect(
      describeBreakdownLine(
        line({ kind: "playoff_milestone", label: "Divisional Round appearance", points: 20 }),
      ).text,
    ).toBe("Divisional Round appearance");
  });
});
