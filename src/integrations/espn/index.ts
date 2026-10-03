/**
 * The ESPN adapter's public surface. Everything returned here is a vendor-neutral fact; no ESPN
 * response type, URL or field name is exported. Features import from "@/integrations/espn" only.
 */
export { fetchTeamRecords, isPerTeamRecordsSport, type TeamRecordsOptions } from "./records";
export {
  fetchAthleteDirectory,
  fetchTeamDirectory,
  type AthleteDirectoryOptions,
  type DirectoryOptions,
  type DirectorySkip,
} from "./directory";
export { fetchPostseasonStages } from "./postseason";
export {
  fetchScheduledGames,
  type GamesWindow,
  type ScheduledGamesFeed,
  type ScheduledGamesRequest,
} from "./games";
export { fetchWtaRankings, fetchPgaSeasonStandings } from "./rankings";
export { fetchMajorResults, TENNIS_MAJOR_LABELS, GOLF_MAJOR_LABELS } from "./majors";
export {
  POSTSEASON_STAGES,
  isPostseasonSport,
  withImpliedEarlierStages,
  type PostseasonAppearance,
  type PostseasonSport,
  type PostseasonStage,
  type PostseasonStageOf,
} from "./stages";
export type {
  DirectoryEntry,
  GolfFinish,
  GolfMajorResult,
  RankedAthlete,
  ScheduledGame,
  ScheduledGameSide,
  TeamRecord,
  TennisFinish,
  TennisMajorResult,
} from "./facts";
export type { EspnClientOptions, EspnError, EspnErrorCode } from "./http";
