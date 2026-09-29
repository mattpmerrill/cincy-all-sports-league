import type { ScoreUpdateItem } from "@/domain/feed";
import type { LeagueData } from "@/domain/league";
import { fromUnits, scoreParticipant, toUnits } from "@/domain/scoring";
import type { ParticipantResult, ScoringRule } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";
import type { ExistingResult, PlannedUpsert } from "./plan";

/** One participant's facts before and after a sync run, for the sports that changed. */
export type ParticipantChange = {
  sport: SportCode;
  participantId: string;
  before: ParticipantResult[];
  after: ParticipantResult[];
};

type Fact = { ruleId: string; quantity: number; eventLabel: string };

const toResult = (r: {
  ruleId: string;
  quantity: number;
  eventLabel: string;
}): ParticipantResult => ({
  ruleId: r.ruleId,
  quantity: r.quantity,
  eventLabel: r.eventLabel,
});

/**
 * The before/after facts for every participant a plan touches. Upserts replace on the table's
 * natural key (participant, rule, event) and deletes remove by id, same as `applyChanges`.
 */
export function planChanges(
  sport: SportCode,
  existing: readonly ExistingResult[],
  upserts: readonly PlannedUpsert[],
  deleteIds: readonly string[],
): ParticipantChange[] {
  const touched = new Set([...upserts.map((u) => u.participantId)]);
  const deleted = new Set(deleteIds);
  for (const e of existing) if (deleted.has(e.id)) touched.add(e.participantId);

  const key = (r: { participantId: string; ruleId: string; eventLabel: string }) =>
    `${r.participantId}|${r.ruleId}|${r.eventLabel}`;

  return [...touched].map((participantId) => {
    const before = existing.filter((e) => e.participantId === participantId);
    const after = new Map<string, Fact>(
      before.filter((e) => !deleted.has(e.id)).map((e) => [key(e), e]),
    );
    for (const u of upserts) if (u.participantId === participantId) after.set(key(u), u);
    return {
      sport,
      participantId,
      before: before.map(toResult),
      after: [...after.values()].map(toResult),
    };
  });
}

/**
 * Point deltas per team pick, from the domain scoring on the facts before and after. Every team
 * that picked a participant gets its own item. Participants nobody picked produce nothing.
 */
export function computeScoreChanges(
  data: LeagueData,
  changes: readonly ParticipantChange[],
): ScoreUpdateItem[] {
  const rulesBySport = new Map<SportCode, ScoringRule[]>();
  for (const { sport, rule } of data.rules) {
    rulesBySport.set(sport, [...(rulesBySport.get(sport) ?? []), rule]);
  }
  const sportConfig = new Map(data.sports.map((s) => [s.code, s]));

  return changes.flatMap((change) => {
    const config = {
      sport: change.sport,
      playoffScoringMode: data.season.playoffScoringMode,
      majorPointsCap: sportConfig.get(change.sport)?.majorPointsCap ?? null,
    };
    const rules = rulesBySport.get(change.sport) ?? [];
    const delta = fromUnits(
      toUnits(scoreParticipant(rules, change.after, config).total) -
        toUnits(scoreParticipant(rules, change.before, config).total),
    );
    if (delta === 0) return [];

    return data.teams.flatMap((team) =>
      team.picks
        .filter((p) => p.sport === change.sport && p.participant.id === change.participantId)
        .map((p) => ({
          teamSlug: team.slug,
          teamName: team.name,
          participantName: p.participant.name,
          sport: change.sport,
          pointsDelta: delta,
        })),
    );
  });
}
