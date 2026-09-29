import { fromUnits, toUnits } from "@/domain/scoring";
import type { ScoreTotals } from "@/domain/scoring";

/**
 * What a team is credited for one pick: the participant's live score, minus what the participant
 * had already earned when the team acquired it (`baseline`), plus what the team earned from
 * participants it has since traded away (`banked`). ADR-003.
 *
 * Lives beside `scoreFantasyTeam` because it answers a team question ("what did this team earn?"),
 * not a participant one, and `scoreParticipant` must stay a pure function of facts. A drafted pick
 * has a zero baseline and no banked rows, so the result equals the live score.
 */
export function creditedScore(
  live: ScoreTotals,
  baseline: ScoreTotals,
  banked: readonly ScoreTotals[],
): ScoreTotals {
  const sum = (pick: (s: ScoreTotals) => number) =>
    fromUnits(
      banked.reduce(
        (acc, b) => acc + toUnits(pick(b)),
        toUnits(pick(live)) - toUnits(pick(baseline)),
      ),
    );
  return {
    total: sum((s) => s.total),
    postseasonPoints: sum((s) => s.postseasonPoints),
    // Whole numbers: unit rounding would only add noise.
    championships:
      live.championships - baseline.championships + banked.reduce((n, b) => n + b.championships, 0),
  };
}
