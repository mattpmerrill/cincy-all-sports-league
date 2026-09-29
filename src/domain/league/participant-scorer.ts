import { scoreParticipant } from "@/domain/scoring";
import type { ParticipantScore, ScoringRule } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";
import type { LeagueData, ResultData } from "./types";

/**
 * The one place a participant's facts become a score. The league model uses it for picks and the
 * free-agent flow uses it for participants nobody holds, so a free agent's number on the page is
 * exactly the number a move will bank or baseline against.
 *
 * Scores are memoised per participant: a shared WNBA pick is scored once, not once per team.
 */
export function createParticipantScorer(
  data: LeagueData,
): (sport: SportCode, participantId: string) => ParticipantScore {
  const rulesBySport = new Map<SportCode, ScoringRule[]>();
  for (const { sport, rule } of data.rules)
    rulesBySport.set(sport, [...(rulesBySport.get(sport) ?? []), rule]);

  const sportSeason = new Map(data.sports.map((s) => [s.code, s]));

  const resultsByParticipant = new Map<string, ResultData[]>();
  for (const r of data.results)
    resultsByParticipant.set(r.participantId, [
      ...(resultsByParticipant.get(r.participantId) ?? []),
      r,
    ]);

  const cache = new Map<string, ParticipantScore>();
  return (sport, participantId) => {
    // Sport is part of the key: a participant scored first under a wrong sport must not poison a
    // later correct call.
    const key = `${sport}:${participantId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const season = sportSeason.get(sport);
    if (!season) throw new Error(`Sport "${sport}" has no season_sports row`);
    const score = scoreParticipant(
      rulesBySport.get(sport) ?? [],
      resultsByParticipant.get(participantId) ?? [],
      {
        sport,
        playoffScoringMode: data.season.playoffScoringMode,
        majorPointsCap: season.majorPointsCap,
      },
    );
    cache.set(key, score);
    return score;
  };
}
