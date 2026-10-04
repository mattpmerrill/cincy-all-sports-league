import { fromUnits, toUnits } from "@/domain/scoring";
import type { Matchup, MatchupResult, MatchupSideKey, MatchupStatus } from "./types";

/** Who is ahead: a side, or "tied" while the gains are equal (0 to 0 included). */
export type MatchupLeader = MatchupSideKey | "tied";

export type FinalSideScore = { teamId: string; gain: number; result: MatchupResult };
/** `gain` is null when the team is missing from the current totals, so nothing is guessed. */
export type LiveSideScore = { teamId: string; gain: number | null };

export type ScoredMatchup =
  | { state: "final"; home: FinalSideScore; away: FinalSideScore; leader: MatchupLeader }
  | {
      state: "live";
      home: LiveSideScore;
      away: LiveSideScore;
      /** Null when either gain is unknown: a lead cannot be called from half the facts. */
      leader: MatchupLeader | null;
    };

/** Final exactly when both end totals exist (the database keeps them both set or both null). */
export const matchupStatus = (matchup: Matchup): MatchupStatus =>
  matchup.home.endPoints !== null && matchup.away.endPoints !== null ? "final" : "live";

const RESULT_OF: Record<MatchupLeader, Record<MatchupSideKey, MatchupResult>> = {
  home: { home: "win", away: "loss" },
  away: { home: "loss", away: "win" },
  tied: { home: "tie", away: "tie" },
};

/** Compares in integer units so 0.1 + 0.2 style drift can never invent a leader. */
function leaderOf(homeGainUnits: number, awayGainUnits: number): MatchupLeader {
  if (homeGainUnits === awayGainUnits) return "tied";
  return homeGainUnits > awayGainUnits ? "home" : "away";
}

/**
 * A team's weekly score is its season total minus its frozen start total: the current total while
 * the matchup is live, the frozen end total once it is final (current totals are then ignored, so
 * a later correction cannot rewrite a finished week). A gain can be negative, because a corrected
 * result can lower a total.
 *
 * `currentTotals` maps team id to season total. A live side whose team is absent, or whose total is
 * not a finite number, gets a null gain rather than NaN or a made-up zero.
 */
export function scoreMatchup(
  matchup: Matchup,
  currentTotals: ReadonlyMap<string, number>,
): ScoredMatchup {
  const { home, away } = matchup;

  if (home.endPoints !== null && away.endPoints !== null) {
    const homeUnits = toUnits(home.endPoints) - toUnits(home.startPoints);
    const awayUnits = toUnits(away.endPoints) - toUnits(away.startPoints);
    const leader = leaderOf(homeUnits, awayUnits);
    return {
      state: "final",
      home: { teamId: home.teamId, gain: fromUnits(homeUnits), result: RESULT_OF[leader].home },
      away: { teamId: away.teamId, gain: fromUnits(awayUnits), result: RESULT_OF[leader].away },
      leader,
    };
  }

  const liveUnits = (side: Matchup["home"]): number | null => {
    const total = currentTotals.get(side.teamId);
    return total === undefined || !Number.isFinite(total)
      ? null
      : toUnits(total) - toUnits(side.startPoints);
  };
  const homeUnits = liveUnits(home);
  const awayUnits = liveUnits(away);
  return {
    state: "live",
    home: { teamId: home.teamId, gain: homeUnits === null ? null : fromUnits(homeUnits) },
    away: { teamId: away.teamId, gain: awayUnits === null ? null : fromUnits(awayUnits) },
    leader: homeUnits === null || awayUnits === null ? null : leaderOf(homeUnits, awayUnits),
  };
}
