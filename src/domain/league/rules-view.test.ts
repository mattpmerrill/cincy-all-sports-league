import { describe, expect, it } from "vitest";
import { groupRules } from "./rules-view";
import type { RuleData } from "./types";

const rule = (
  code: string,
  sortOrder: number,
  r: Omit<RuleData["rule"], "id" | "label" | "isChampionship"> & {
    isChampionship?: boolean;
    label?: string;
  },
): RuleData => ({
  sport: "nfl",
  code,
  sortOrder,
  rule: { id: code, label: r.label ?? code, isChampionship: false, ...r } as RuleData["rule"],
});

describe("groupRules", () => {
  it("orders groups fixed, rows by sort order, and words per-win rates", () => {
    const groups = groupRules([
      rule("wild_card", 3, { kind: "playoff_milestone", points: 10 }),
      rule("tie", 2, { kind: "per_tie", points: 1.5 }),
      rule("champion", 0, { kind: "playoff_milestone", points: 50, isChampionship: true }),
      rule("win", 1, { kind: "per_win", points: 3 }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["regular_season", "playoffs"]);
    expect(groups[0]?.rows.map((r) => r.value)).toEqual(["3 per win", "1.5 per tie"]);
    expect(groups[1]?.rows.map((r) => [r.label, r.value, r.isChampionship])).toEqual([
      ["champion", "50 pts", true],
      ["wild_card", "10 pts", false],
    ]);
  });

  it("drops groups a sport has no rules for", () => {
    expect(groupRules([])).toEqual([]);
  });
});
