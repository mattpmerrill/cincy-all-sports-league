import { describe, expect, it } from "vitest";
import type { BreakdownLine } from "@/domain/scoring";
import type { PickAdjustment } from "./credit-pick";
import { describeBreakdownLine, describePickBreakdown } from "./describe-breakdown";

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

describe("describePickBreakdown", () => {
  const score = { lines: [line({ quantity: 4, rate: 2, points: 8 })] };
  const zero = { total: 0, championships: 0, postseasonPoints: 0 };
  const adjustment = (over: Partial<PickAdjustment>): PickAdjustment => ({
    baseline: zero,
    banked: [],
    ...over,
  });
  const bears = {
    id: "p",
    name: "Chicago Bears",
    shortName: "CHI",
    logoUrl: null,
    primaryColor: null,
  };

  it("is exactly the scoring lines when nothing was traded", () => {
    expect(describePickBreakdown({ score, adjustment: adjustment({}) })).toEqual([
      { text: "4 wins × 2", points: 8, isAdjustment: false },
    ]);
  });

  it("says what was earned before the team got the player, as a deduction", () => {
    const views = describePickBreakdown({
      score,
      adjustment: adjustment({ baseline: { ...zero, total: 6 } }),
    });
    expect(views.at(-1)).toEqual({
      text: "Earned 6 pts before joining this team (not counted)",
      points: -6,
      isAdjustment: true,
    });
    expect(views.reduce((sum, v) => sum + v.points, 0)).toBe(2);
  });

  it("names the traded-away player whose points the team kept, and skips empty ones", () => {
    const views = describePickBreakdown({
      score: { lines: [] },
      adjustment: adjustment({
        banked: [
          {
            sport: "nfl",
            participant: bears,
            source: "trade",
            total: 12,
            championships: 0,
            postseasonPoints: 0,
          },
          {
            sport: "nfl",
            participant: { ...bears, name: "Jets" },
            source: "trade",
            total: 0,
            championships: 0,
            postseasonPoints: 0,
          },
        ],
      }),
    });
    expect(views).toEqual([
      {
        text: "Includes 12 pts from Chicago Bears before the trade",
        points: 12,
        isAdjustment: true,
      },
    ]);
  });

  it("words a dropped player differently from a traded one, for gains and losses alike", () => {
    const banked = (total: number, source: "trade" | "free_agent") => ({
      sport: "nfl" as const,
      participant: bears,
      source,
      total,
      championships: 0,
      postseasonPoints: 0,
    });
    const texts = (b: ReturnType<typeof banked>[]) =>
      describePickBreakdown({ score: { lines: [] }, adjustment: adjustment({ banked: b }) }).map(
        (v) => v.text,
      );
    expect(texts([banked(5, "free_agent"), banked(5, "trade")])).toEqual([
      "Includes 5 pts from Chicago Bears before dropping them",
      "Includes 5 pts from Chicago Bears before the trade",
    ]);
    expect(texts([banked(-3, "free_agent")])).toEqual([
      "Less 3 pts from Chicago Bears before dropping them",
    ]);
  });

  it("uses singular for one point", () => {
    const views = describePickBreakdown({
      score: { lines: [] },
      adjustment: adjustment({ baseline: { ...zero, total: 1 } }),
    });
    expect(views[0]?.text).toBe("Earned 1 pt before joining this team (not counted)");
  });
});
