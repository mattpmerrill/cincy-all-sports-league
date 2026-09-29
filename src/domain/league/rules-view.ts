import type { ScoringRule } from "@/domain/scoring";
import { formatPoints } from "./format";
import type { RuleData } from "./types";

export type RuleRow = { label: string; value: string; isChampionship: boolean };
export type RuleGroupKind = "regular_season" | "playoffs" | "majors" | "final_rank";
export type RuleGroup = { kind: RuleGroupKind; title: string; rows: RuleRow[] };

const GROUP_ORDER: readonly RuleGroupKind[] = [
  "regular_season",
  "playoffs",
  "majors",
  "final_rank",
];

const TITLES: Record<RuleGroupKind, string> = {
  regular_season: "Regular season",
  playoffs: "Postseason",
  majors: "Major events",
  final_rank: "Year-end ranking",
};

function groupOf(rule: ScoringRule): RuleGroupKind {
  switch (rule.kind) {
    case "per_win":
    case "per_tie":
      return "regular_season";
    case "playoff_milestone":
      return "playoffs";
    case "major_finish":
      return "majors";
    case "final_rank_band":
      return "final_rank";
  }
}

function valueOf(rule: ScoringRule): string {
  const points = formatPoints(rule.points);
  if (rule.kind === "per_win") return `${points} per win`;
  if (rule.kind === "per_tie") return `${points} per tie`;
  return `${points} pts`;
}

/**
 * One sport's rubric as display groups, in a fixed group order and the DB's sort order inside each
 * group (so champion leads the postseason list). Empty groups are dropped.
 */
export function groupRules(rules: readonly RuleData[]): RuleGroup[] {
  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  return GROUP_ORDER.flatMap((kind) => {
    const rows = sorted
      .filter(({ rule }) => groupOf(rule) === kind)
      .map(({ rule }) => ({
        label: rule.label,
        value: valueOf(rule),
        isChampionship: rule.isChampionship,
      }));
    return rows.length > 0 ? [{ kind, title: TITLES[kind], rows }] : [];
  });
}
