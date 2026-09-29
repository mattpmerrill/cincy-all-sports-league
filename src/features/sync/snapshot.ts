import { creditPick } from "@/domain/league";
import type { LeagueData } from "@/domain/league";
import { scoreParticipant, type ScoringRule } from "@/domain/scoring";
import { rankStandings, scoreFantasyTeam } from "@/domain/standings";
import type { SportCode } from "@/domain/sports/sports";

export type SnapshotRow = { teamId: string; rank: number; totalPoints: number };

/**
 * Today's rank and total for every fantasy team, from the same domain functions the public pages
 * use: scoreParticipant -> creditPick -> scoreFantasyTeam -> rankStandings. Pure. Teams are scored
 * on credited points, so a trade on its own never moves a total (and never fakes a "mover").
 */
export function computeSnapshotRows(data: LeagueData): SnapshotRow[] {
  const rulesBySport = new Map<SportCode, ScoringRule[]>();
  for (const { sport, rule } of data.rules) {
    rulesBySport.set(sport, [...(rulesBySport.get(sport) ?? []), rule]);
  }
  const sportConfig = new Map(data.sports.map((s) => [s.code, s]));
  const resultsByParticipant = new Map<string, LeagueData["results"]>();
  for (const r of data.results) {
    resultsByParticipant.set(r.participantId, [
      ...(resultsByParticipant.get(r.participantId) ?? []),
      r,
    ]);
  }

  const teams = data.teams.map((team) =>
    scoreFantasyTeam({
      id: team.id,
      name: team.name,
      picks: team.picks.map((pick) => {
        const { sport, participant } = pick;
        const live = scoreParticipant(
          rulesBySport.get(sport) ?? [],
          resultsByParticipant.get(participant.id) ?? [],
          {
            sport,
            playoffScoringMode: data.season.playoffScoringMode,
            majorPointsCap: sportConfig.get(sport)?.majorPointsCap ?? null,
          },
        );
        return { sport, score: creditPick(team, pick, live).credited };
      }),
    }),
  );

  return rankStandings(teams).map((t) => ({
    teamId: t.teamId,
    rank: t.rank,
    totalPoints: t.total,
  }));
}
