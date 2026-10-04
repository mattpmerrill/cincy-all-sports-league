import type { Logger } from "@/lib/logger";
import { err, type AppError, type Result } from "@/lib/result";
import type {
  MatchupRecords,
  MatchupStandings,
  MatchupsService,
  TeamMatchups,
  WeekMatchups,
} from "./matchups.service";

const UNAVAILABLE = "matchups_unavailable";
export type MatchupsUnavailable = AppError<typeof UNAVAILABLE>;

/**
 * The matchups reads for pages that must keep working without them (Week, Standings, a team
 * page). Matchups are secondary there, so a failed read is logged with its cause and comes back
 * as "unavailable": the page leaves the section out, or says so in place, and the rest renders.
 * A missing season or an unknown team is not a failure, it is just `null` as before.
 */
export function createSafeMatchupReads(service: MatchupsService, log: Logger) {
  async function guard<T>(
    read: string,
    run: () => Promise<T>,
  ): Promise<Result<T, MatchupsUnavailable>> {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      log.error("matchups read failed", { read, error });
      return err(UNAVAILABLE, "Matchups are not loading right now.");
    }
  }

  return {
    weekMatchups: (input: Parameters<MatchupsService["getWeekMatchups"]>[0]) =>
      guard<WeekMatchups | null>("week", () => service.getWeekMatchups(input)),
    standings: (input: Parameters<MatchupsService["getMatchupStandings"]>[0]) =>
      guard<MatchupStandings | null>("standings", () => service.getMatchupStandings(input)),
    teamMatchups: (teamSlug: string) =>
      guard<TeamMatchups | null>("team", () => service.getTeamMatchups({ teamSlug })),
    records: () => guard<MatchupRecords>("records", () => service.getMatchupRecords()),
  };
}

export type SafeMatchupReads = ReturnType<typeof createSafeMatchupReads>;
