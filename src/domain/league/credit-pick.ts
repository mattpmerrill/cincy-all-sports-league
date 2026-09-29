import type { ScoreTotals } from "@/domain/scoring";
import { creditedScore } from "@/domain/standings";
import type { BankedScoreData, PickData, TeamData } from "./types";

/** Why a pick's credited score differs from the participant's live score. Both empty when drafted. */
export type PickAdjustment = {
  /** Earned before the team acquired the participant; not counted. */
  baseline: ScoreTotals;
  /** Earned from participants this team traded away in this sport; counted. */
  banked: BankedScoreData[];
};

export type CreditedPick = { credited: ScoreTotals; adjustment: PickAdjustment };

/**
 * A team credits one pick per sport, so the banked rows for that sport belong to that pick: a team
 * that traded a player away keeps his points in the sport's subtotal through its new pick. Shared
 * by the league model and the sync snapshot so both rank teams on the same numbers.
 */
export function creditPick(
  team: Pick<TeamData, "banked">,
  pick: Pick<PickData, "sport" | "baseline">,
  live: ScoreTotals,
): CreditedPick {
  const banked = team.banked.filter((b) => b.sport === pick.sport);
  return {
    credited: creditedScore(live, pick.baseline, banked),
    adjustment: { baseline: pick.baseline, banked },
  };
}
