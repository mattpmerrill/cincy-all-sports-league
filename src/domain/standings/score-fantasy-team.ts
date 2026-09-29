import type { ScoreTotals } from "@/domain/scoring";
import { sumPoints } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";

/**
 * `score` is what the team is credited for the pick (see `creditedScore`), not the participant's
 * full live score; the two differ only after a trade.
 */
export type FantasyTeamPick = { sport: SportCode; score: ScoreTotals };

export type FantasyTeamInput = {
  id: string;
  name: string;
  picks: readonly FantasyTeamPick[];
};

export type SportSubtotal = { sport: SportCode; points: number };

/** A team's totals plus everything the tiebreakers need. */
export type TeamScore = {
  teamId: string;
  teamName: string;
  total: number;
  sportSubtotals: SportSubtotal[];
  championships: number;
  postseasonPoints: number;
  /** Number of sports where the team has scored above 0 (third tiebreaker). */
  sportsWithPoints: number;
};

export function scoreFantasyTeam(team: FantasyTeamInput): TeamScore {
  const bySport = new Map<SportCode, number[]>();
  for (const { sport, score } of team.picks) {
    bySport.set(sport, [...(bySport.get(sport) ?? []), score.total]);
  }
  const sportSubtotals = [...bySport].map(([sport, totals]) => ({
    sport,
    points: sumPoints(totals),
  }));

  return {
    teamId: team.id,
    teamName: team.name,
    total: sumPoints(team.picks.map((p) => p.score.total)),
    sportSubtotals,
    championships: team.picks.reduce((n, p) => n + p.score.championships, 0),
    postseasonPoints: sumPoints(team.picks.map((p) => p.score.postseasonPoints)),
    sportsWithPoints: sportSubtotals.filter((s) => s.points > 0).length,
  };
}
