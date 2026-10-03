import {
  fetchMajorResults,
  fetchPgaSeasonStandings,
  fetchPostseasonStages,
  fetchTeamRecords,
  fetchWtaRankings,
  isPerTeamRecordsSport,
  isPostseasonSport,
  withImpliedEarlierStages,
  type EspnClientOptions,
} from "@/integrations/espn";
import { ok, type Result } from "@/lib/result";
import type { FactsRequest, ProviderError, ResultsProvider, SportFacts } from "./results-provider";

/**
 * The ESPN implementation. League decision applied here, not in the adapter: reaching a later
 * round counts as reaching every earlier one, so a bye (an NFL #1 seed skipping Wild Card) still
 * earns the earlier milestones.
 */
export function createEspnResultsProvider(options: EspnClientOptions = {}): ResultsProvider {
  return {
    fetchesPerParticipant: isPerTeamRecordsSport,

    async fetchFacts({ sport, season, externalIds }: FactsRequest) {
      if (sport === "wta") return wta(season, options);
      if (sport === "pga") return pga(season, options);

      const records = await fetchTeamRecords(sport, season, {
        ...options,
        espnTeamIds: externalIds,
      });
      if (!records.ok) return records;
      const facts: SportFacts = {
        records: records.value.map((r) => ({
          externalId: r.espnTeamId,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          otLosses: r.otLosses,
        })),
      };

      if (isPostseasonSport(sport)) {
        const stages = await fetchPostseasonStages(sport, season, options);
        if (!stages.ok) return stages;
        facts.stages = withImpliedEarlierStages(sport, stages.value).map((a) => ({
          externalId: a.espnTeamId,
          stage: a.stage,
        }));
      }
      return ok(facts);
    },
  };
}

async function wta(
  season: number,
  options: EspnClientOptions,
): Promise<Result<SportFacts, ProviderError>> {
  const [ranks, majors] = await Promise.all([
    fetchWtaRankings(options),
    fetchMajorResults("wta", season, options),
  ]);
  if (!ranks.ok) return ranks;
  if (!majors.ok) return majors;
  return ok({
    ranks: ranks.value.map((r) => ({ externalId: r.espnAthleteId, rank: r.rank })),
    majors: majors.value.map((m) => ({
      externalId: m.espnAthleteId,
      eventName: m.eventName,
      finish: m.finish,
      completed: m.eventCompleted,
    })),
  });
}

async function pga(
  season: number,
  options: EspnClientOptions,
): Promise<Result<SportFacts, ProviderError>> {
  const [ranks, majors] = await Promise.all([
    fetchPgaSeasonStandings(season, options),
    fetchMajorResults("pga", season, options),
  ]);
  if (!ranks.ok) return ranks;
  if (!majors.ok) return majors;
  return ok({
    ranks: ranks.value.map((r) => ({ externalId: r.espnAthleteId, rank: r.rank })),
    majors: majors.value.map((m) => ({
      externalId: m.espnAthleteId,
      eventName: m.eventName,
      finish: m.finish,
      completed: m.eventCompleted,
    })),
  });
}
