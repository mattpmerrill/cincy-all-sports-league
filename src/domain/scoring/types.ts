import type { SportCode } from "@/domain/sports/sports";

/** Mirrors the shared DB contract (scoring_rules.kind). The DB stores facts; these rules turn them into points. */
export type ScoringRuleKind =
  "per_win" | "per_tie" | "playoff_milestone" | "major_finish" | "final_rank_band";

type RuleBase = {
  id: string;
  /** Shown in the breakdown, e.g. "Win", "Conference championship". */
  label: string;
  /** Points per unit for per_win/per_tie; flat points for the other kinds. */
  points: number;
  /** True for every playoff "Champion" milestone and every major "Champion" finish (tiebreaker input). */
  isChampionship: boolean;
};

export type ScoringRule =
  | (RuleBase & { kind: "per_win" })
  | (RuleBase & { kind: "per_tie" })
  | (RuleBase & { kind: "playoff_milestone" })
  | (RuleBase & { kind: "major_finish" })
  | (RuleBase & { kind: "final_rank_band"; rankFrom: number; rankTo: number });

/** One fact row for a participant. Quantity is wins/ties, 1 for milestones/finishes, or the actual rank. */
export type ParticipantResult = {
  ruleId: string;
  quantity: number;
  /** Set for major_finish rows ("US Open"). */
  eventLabel?: string | null;
};

/** cumulative: every milestone reached adds up. highest_only: only the best one counts. */
export type PlayoffScoringMode = "cumulative" | "highest_only";

export type SportScoringConfig = {
  sport: SportCode;
  playoffScoringMode: PlayoffScoringMode;
  /** Cap on the summed major_finish points (tennis/golf). null = uncapped. */
  majorPointsCap: number | null;
};

export type BreakdownLineKind = ScoringRuleKind | "major_cap";

/** One explainable line: "4 wins × 4.1 = 16.4". Lines always sum to the total. */
export type BreakdownLine = {
  kind: BreakdownLineKind;
  ruleId: string | null;
  label: string;
  /** Count for wins/ties, 1 for milestones/finishes, the actual rank for rank bands. */
  quantity: number;
  /** Points per quantity for per_win/per_tie; null when the line is a flat award. */
  rate: number | null;
  eventLabel: string | null;
  /** Negative for the cap adjustment. */
  points: number;
};

export type ParticipantScore = {
  total: number;
  /** playoff_milestone + major_finish points (after the cap); the second tiebreaker. */
  postseasonPoints: number;
  /** Result rows on championship rules; the first tiebreaker. */
  championships: number;
  lines: BreakdownLine[];
};

/** The three numbers a team's standing is built from, without the line-by-line explanation. */
export type ScoreTotals = Pick<ParticipantScore, "total" | "postseasonPoints" | "championships">;
