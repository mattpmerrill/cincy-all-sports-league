import { fromUnits, multiplyUnits, toUnits } from "./points";
import type {
  BreakdownLine,
  ParticipantResult,
  ParticipantScore,
  ScoringRule,
  SportScoringConfig,
} from "./types";

/**
 * Turns one participant's facts into points plus an itemized breakdown. Pure; the caller passes
 * only the rules for the participant's sport and season.
 */
export function scoreParticipant(
  rules: readonly ScoringRule[],
  results: readonly ParticipantResult[],
  config: SportScoringConfig,
): ParticipantScore {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));

  const resolved = results.map((result) => {
    const rule = rulesById.get(result.ruleId);
    // A result for an unknown rule is a data bug; failing loudly beats silently dropping points.
    if (!rule) throw new Error(`No scoring rule "${result.ruleId}" for sport ${config.sport}`);
    return { rule, result };
  });

  const lines: BreakdownLine[] = [];
  const line = (
    rule: ScoringRule,
    quantity: number,
    eventLabel: string | null,
    unitsAwarded: number,
  ) =>
    lines.push({
      kind: rule.kind,
      ruleId: rule.id,
      label: rule.label,
      quantity,
      rate: rule.kind === "per_win" || rule.kind === "per_tie" ? rule.points : null,
      eventLabel,
      points: fromUnits(unitsAwarded),
    });

  // Championships are counted from result rows, not from points, so a 0-point champion rule still counts.
  const championships = resolved.filter(({ rule }) => rule.isChampionship).length;

  let postseasonUnits = 0;

  for (const { rule, result } of resolved) {
    if (rule.kind === "per_win" || rule.kind === "per_tie") {
      line(rule, result.quantity, null, multiplyUnits(toUnits(rule.points), result.quantity));
    }
  }

  // Milestones: a milestone is reached once, so dedupe by rule (sync upserts are unique anyway).
  const milestones = [
    ...new Map(
      resolved
        .filter(({ rule }) => rule.kind === "playoff_milestone")
        .map((r) => [r.rule.id, r.rule]),
    ).values(),
  ];
  if (milestones.length > 0) {
    const counted =
      config.playoffScoringMode === "cumulative"
        ? milestones
        : [milestones.reduce((best, m) => (toUnits(m.points) > toUnits(best.points) ? m : best))];
    for (const rule of counted) {
      line(rule, 1, null, toUnits(rule.points));
      postseasonUnits += toUnits(rule.points);
    }
  }

  // Majors: one row per event, summed, then capped as a whole (not per event).
  const majors = resolved.filter(({ rule }) => rule.kind === "major_finish");
  let majorUnits = 0;
  for (const { rule, result } of majors) {
    line(rule, 1, result.eventLabel ?? null, toUnits(rule.points));
    majorUnits += toUnits(rule.points);
  }
  if (config.majorPointsCap !== null && majorUnits > toUnits(config.majorPointsCap)) {
    const capUnits = toUnits(config.majorPointsCap);
    lines.push({
      kind: "major_cap",
      ruleId: null,
      label: `Majors capped at ${config.majorPointsCap}`,
      quantity: 1,
      rate: null,
      eventLabel: null,
      points: fromUnits(capUnits - majorUnits),
    });
    majorUnits = capUnits;
  }
  postseasonUnits += majorUnits;

  // Rank bands: the band containing the rank pays; outside every band pays 0 (no line).
  for (const { rule, result } of resolved) {
    if (rule.kind !== "final_rank_band") continue;
    if (result.quantity >= rule.rankFrom && result.quantity <= rule.rankTo) {
      line(rule, result.quantity, null, toUnits(rule.points));
    }
  }

  const totalUnits = lines.reduce((sum, l) => sum + toUnits(l.points), 0);
  return {
    total: fromUnits(totalUnits),
    postseasonPoints: fromUnits(postseasonUnits),
    championships,
    lines,
  };
}
